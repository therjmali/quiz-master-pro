-- ============================================================================
-- R.J QUIZ - Quiz Master Pro: Supabase schema (cloud sync)
--
-- Run ONCE in: Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run (idempotent).
--
-- * Everything lives in the quiz_* namespace, so this can share a Supabase project (and its sign-in
--   accounts) with other apps - e.g. RJ Tracker Pro - without touching their tables or functions.
-- * Every row is owned by auth.users.id and protected by Row-Level Security: a signed-in user can only
--   ever see or change their own rows. Sync tables are READ-ONLY for clients; all writes go through the
--   SECURITY DEFINER functions below, which enforce ownership, a version check and size limits.
-- * Auth settings: Authentication -> Providers -> Email. Turn "Confirm email" OFF for a private app
--   (the free mailer is rate-limited), or keep it ON and users confirm via the mailed link.
-- ============================================================================

-- ── Tables ───────────────────────────────────────────────────
-- One row per user: the document version used for optimistic concurrency.
create table if not exists public.quiz_sync_docs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  version    integer     not null default 0,
  updated_at timestamptz not null default now()
);

-- One row per synced section (a logical store such as 'bookmarks', or a month of quiz history), as JSON.
create table if not exists public.quiz_sync_sections (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  key        text        not null check (key ~ '^[A-Za-z0-9._:-]{1,80}$'),
  value      jsonb       not null,
  hash       text        not null,
  updated_at timestamptz not null default now(),
  device_id  text,
  primary key (user_id, key)
);

-- Restore points (last 5 accepted versions).
create table if not exists public.quiz_sync_revisions (
  user_id   uuid        not null references auth.users(id) on delete cascade,
  version   integer     not null,
  at        timestamptz not null default now(),
  device_id text,
  keys      text[]      not null default '{}',
  snapshot  jsonb       not null,
  primary key (user_id, version)
);

-- Signed-in device registry (names shown in Cloud sync → Devices).
create table if not exists public.quiz_devices (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  device_id    text        not null,
  name         text        not null default 'Device',
  platform     text        not null default 'web',
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.quiz_sync_docs      enable row level security;
alter table public.quiz_sync_sections  enable row level security;
alter table public.quiz_sync_revisions enable row level security;
alter table public.quiz_devices        enable row level security;

drop policy if exists "quiz_sync_docs: read own"      on public.quiz_sync_docs;
drop policy if exists "quiz_sync_sections: read own"  on public.quiz_sync_sections;
drop policy if exists "quiz_sync_revisions: read own" on public.quiz_sync_revisions;
drop policy if exists "quiz_devices: own rows"        on public.quiz_devices;

-- Sync tables are READ-ONLY for clients. All writes go through the RPCs below,
-- which enforce the version check, size limits and ownership.
create policy "quiz_sync_docs: read own" on public.quiz_sync_docs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "quiz_sync_sections: read own" on public.quiz_sync_sections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "quiz_sync_revisions: read own" on public.quiz_sync_revisions
  for select to authenticated using (user_id = (select auth.uid()));

create policy "quiz_devices: own rows" on public.quiz_devices
  for all to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.quiz_sync_docs, public.quiz_sync_sections, public.quiz_sync_revisions from anon, authenticated;
grant select on public.quiz_sync_docs, public.quiz_sync_sections, public.quiz_sync_revisions to authenticated;
revoke all on public.quiz_devices from anon;
grant select, insert, update, delete on public.quiz_devices to authenticated;

-- ── Internal helpers (not callable from the API) ───────────────────────────
create or replace function public._quiz_sync_payload(p_uid uuid, p_version integer, p_updated timestamptz, p_have jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (
    select key, value, hash, updated_at, device_id
    from public.quiz_sync_sections where user_id = p_uid
  ),
  changed as (
    select key from s where p_have is null or (p_have ->> key) is distinct from hash
  ),
  gone as (
    select k as key from jsonb_object_keys(coalesce(p_have, '{}'::jsonb)) k
    where not exists (select 1 from s where s.key = k)
  )
  select jsonb_build_object(
    'version',   p_version,
    'updatedAt', p_updated,
    'sections',  coalesce((select jsonb_object_agg(key, jsonb_build_object('hash', hash, 'updatedAt', updated_at, 'deviceId', device_id)) from s), '{}'::jsonb),
    'data',      coalesce((select jsonb_object_agg(s.key, s.value) from s join changed c on c.key = s.key), '{}'::jsonb),
    'changedKeys', case when p_have is null then '[]'::jsonb
                        else coalesce((select jsonb_agg(key) from (select key from changed union select key from gone) u), '[]'::jsonb) end,
    'bytes',     coalesce((select sum(octet_length(value::text)) from s), 0)
  )
$$;

create or replace function public._quiz_sync_add_revision(p_uid uuid, p_version integer, p_device text, p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  c_keep constant integer := 5;    -- restore points kept per user (free-tier friendly)
begin
  insert into public.quiz_sync_revisions (user_id, version, device_id, keys, snapshot)
  values (
    p_uid, p_version, p_device, coalesce(p_keys, '{}'),
    coalesce((select jsonb_object_agg(key, value) from public.quiz_sync_sections where user_id = p_uid), '{}'::jsonb)
  )
  on conflict (user_id, version) do nothing;

  delete from public.quiz_sync_revisions
  where user_id = p_uid
    and version <= (select max(version) from public.quiz_sync_revisions where user_id = p_uid) - c_keep;
end $$;

-- ── Public RPCs (called by the app; always scoped to auth.uid()) ───────────
create or replace function public.quiz_sync_pull(p_have jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  d   public.quiz_sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.quiz_sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.quiz_sync_docs where user_id = uid;
  return public._quiz_sync_payload(uid, d.version, d.updated_at, p_have);
end $$;

create or replace function public.quiz_sync_push(
  p_base_version integer,
  p_sections     jsonb,
  p_deletions    text[],
  p_device_id    text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  d          public.quiz_sync_docs;
  k          text;
  incoming   jsonb;
  val        jsonb;
  sz         integer;
  old_sz     integer;
  h          text;
  existing   text;
  total      bigint;
  n_sections integer;
  applied    text[] := '{}';
  rejected   jsonb  := '[]'::jsonb;
  max_section constant integer := 8 * 1024 * 1024;
  max_account constant bigint  := 24 * 1024 * 1024;
  max_count   constant integer := 300;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.quiz_sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.quiz_sync_docs where user_id = uid for update;   -- serialises concurrent pushes

  if p_base_version is distinct from d.version then
    return jsonb_build_object('conflict', true) || public._quiz_sync_payload(uid, d.version, d.updated_at, null);
  end if;

  foreach k in array coalesce(p_deletions, '{}') loop
    if k ~ '^[A-Za-z0-9._:-]{1,80}$' then
      delete from public.quiz_sync_sections where user_id = uid and key = k;
      if found then applied := applied || ('-' || k); end if;
    end if;
  end loop;

  select coalesce(sum(octet_length(value::text)), 0), count(*)
    into total, n_sections from public.quiz_sync_sections where user_id = uid;

  for k, incoming in select * from jsonb_each(coalesce(p_sections, '{}'::jsonb)) loop
    if k !~ '^[A-Za-z0-9._:-]{1,80}$' then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'invalid_key'); continue;
    end if;
    if jsonb_typeof(incoming) <> 'object' or not (incoming ? 'value') then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'missing_value'); continue;
    end if;
    val := incoming -> 'value';
    sz  := octet_length(val::text);
    if sz > max_section then
      rejected := rejected || jsonb_build_object('key', k, 'reason', 'section_too_large'); continue;
    end if;
    h := md5(val::text);
    select hash, octet_length(value::text)
      into existing, old_sz
      from public.quiz_sync_sections where user_id = uid and key = k;
    if existing = h then continue; end if;
    if existing is null then
      if n_sections >= max_count then
        rejected := rejected || jsonb_build_object('key', k, 'reason', 'too_many_sections'); continue;
      end if;
      if total + sz > max_account then
        rejected := rejected || jsonb_build_object('key', k, 'reason', 'account_quota_exceeded'); continue;
      end if;
      n_sections := n_sections + 1;
      total := total + sz;
    else
      if total - coalesce(old_sz, 0) + sz > max_account then
        rejected := rejected || jsonb_build_object('key', k, 'reason', 'account_quota_exceeded'); continue;
      end if;
      total := total - coalesce(old_sz, 0) + sz;
    end if;
    insert into public.quiz_sync_sections (user_id, key, value, hash, updated_at, device_id)
    values (uid, k, val, h, now(), p_device_id)
    on conflict (user_id, key) do update
      set value = excluded.value, hash = excluded.hash, updated_at = now(), device_id = excluded.device_id;
    applied := applied || k;
  end loop;

  if coalesce(array_length(applied, 1), 0) = 0 then
    return jsonb_build_object('version', d.version, 'updatedAt', d.updated_at,
      'sections', (public._quiz_sync_payload(uid, d.version, d.updated_at, null) -> 'sections'),
      'applied', '[]'::jsonb, 'rejected', rejected, 'unchanged', true);
  end if;

  update public.quiz_sync_docs set version = version + 1, updated_at = now()
    where user_id = uid returning * into d;
  perform public._quiz_sync_add_revision(uid, d.version, p_device_id, array(select regexp_replace(a, '^-', '') from unnest(applied) a));

  return jsonb_build_object('version', d.version, 'updatedAt', d.updated_at,
    'sections', (public._quiz_sync_payload(uid, d.version, d.updated_at, null) -> 'sections'),
    'applied', to_jsonb(applied), 'rejected', rejected, 'unchanged', false);
end $$;

create or replace function public.quiz_sync_revisions_list()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'currentVersion', coalesce((select version from public.quiz_sync_docs where user_id = uid), 0),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', version, 'at', at, 'deviceId', device_id, 'keys', to_jsonb(keys),
        'bytes', octet_length(snapshot::text)) order by version desc)
      from public.quiz_sync_revisions where user_id = uid), '[]'::jsonb));
end $$;

create or replace function public.quiz_sync_restore(p_version integer, p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  snap jsonb;
  d public.quiz_sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select snapshot into snap from public.quiz_sync_revisions where user_id = uid and version = p_version;
  if snap is null then raise exception 'revision_not_found' using errcode = 'P0002'; end if;
  insert into public.quiz_sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.quiz_sync_docs where user_id = uid for update;

  delete from public.quiz_sync_sections where user_id = uid;
  insert into public.quiz_sync_sections (user_id, key, value, hash, updated_at, device_id)
    select uid, e.key, e.value, md5(e.value::text), now(), p_device_id from jsonb_each(snap) e;

  update public.quiz_sync_docs set version = version + 1, updated_at = now() where user_id = uid returning * into d;
  perform public._quiz_sync_add_revision(uid, d.version, p_device_id, array(select jsonb_object_keys(snap)));
  return jsonb_build_object('restoredFrom', p_version) || public._quiz_sync_payload(uid, d.version, d.updated_at, null);
end $$;

create or replace function public.quiz_sync_wipe(p_device_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); d public.quiz_sync_docs;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.quiz_sync_docs (user_id) values (uid) on conflict do nothing;
  select * into d from public.quiz_sync_docs where user_id = uid for update;
  delete from public.quiz_sync_sections where user_id = uid;
  update public.quiz_sync_docs set version = version + 1, updated_at = now() where user_id = uid returning * into d;
  perform public._quiz_sync_add_revision(uid, d.version, p_device_id, '{}');
  return jsonb_build_object('ok', true, 'version', d.version);
end $$;

-- ── Delete my cloud data / my account ─────────────────────────────────────
-- Removes ONLY the quiz data of the caller (sections, restore points, devices). Their login stays.
create or replace function public.quiz_delete_my_data()
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.quiz_sync_sections  where user_id = uid;
  delete from public.quiz_sync_revisions where user_id = uid;
  delete from public.quiz_sync_docs      where user_id = uid;
  delete from public.quiz_devices        where user_id = uid;
end $$;

-- Deletes the caller's LOGIN (auth.users row) and, through ON DELETE CASCADE, all quiz data.
-- WARNING: if the same Supabase project serves other apps, that login is removed for all of them.
create or replace function public.quiz_delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;


-- ── Lock the functions down: signed-in users only ──────────────────────────
revoke all on function public._quiz_sync_payload(uuid, integer, timestamptz, jsonb)  from public, anon, authenticated;
revoke all on function public._quiz_sync_add_revision(uuid, integer, text, text[])   from public, anon, authenticated;

revoke all on function public.quiz_sync_pull(jsonb)                       from public, anon;
revoke all on function public.quiz_sync_push(integer, jsonb, text[], text) from public, anon;
revoke all on function public.quiz_sync_revisions_list()                  from public, anon;
revoke all on function public.quiz_sync_restore(integer, text)            from public, anon;
revoke all on function public.quiz_sync_wipe(text)                        from public, anon;

grant execute on function public.quiz_sync_pull(jsonb)                       to authenticated;
grant execute on function public.quiz_sync_push(integer, jsonb, text[], text) to authenticated;
grant execute on function public.quiz_sync_revisions_list()                  to authenticated;
grant execute on function public.quiz_sync_restore(integer, text)            to authenticated;
grant execute on function public.quiz_sync_wipe(text)                        to authenticated;
revoke all on function public.quiz_delete_my_data()    from public, anon;
revoke all on function public.quiz_delete_my_account() from public, anon;
grant execute on function public.quiz_delete_my_data()    to authenticated;
grant execute on function public.quiz_delete_my_account() to authenticated;
