-- Behavioural tests for supabase/quiz_schema.sql. Run via scripts/test-sql.sh.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict do nothing;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.reset_role() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false); end $$;

-- ---------------------------------------------------------------------------------------------
do $$
declare
  alice constant text := '11111111-1111-1111-1111-111111111111';
  bob   constant text := '22222222-2222-2222-2222-222222222222';
  r jsonb; hash_a text; i int; n int;
begin
  perform pg_temp.as_user(alice);

  -- 1. fresh pull
  r := public.quiz_sync_pull();
  assert (r->>'version')::int = 0, 'fresh doc starts at version 0';
  assert r->'sections' = '{}'::jsonb, 'fresh doc has no sections';

  -- 2. first push
  r := public.quiz_sync_push(0, '{"bookmarks":{"value":{"a":1}},"hist:2026-11":{"value":{"items":{"x":{"s":90}}}}}'::jsonb, '{}', 'dev-1');
  assert (r->>'version')::int = 1, 'push bumps version to 1';
  assert jsonb_array_length(r->'applied') = 2, 'both sections applied';
  assert (r->>'unchanged')::boolean = false;
  hash_a := r->'sections'->'bookmarks'->>'hash';
  assert hash_a is not null, 'section hash returned';

  -- 3. stale base -> conflict carrying the current document
  r := public.quiz_sync_push(0, '{"bookmarks":{"value":{"a":2}}}'::jsonb, '{}', 'dev-2');
  assert (r->>'conflict')::boolean, 'stale base is a conflict';
  assert (r->>'version')::int = 1, 'conflict reports current version';
  assert r->'data'->'bookmarks' = '{"a":1}'::jsonb, 'conflict payload includes current data';

  -- 4. identical content is a no-op
  r := public.quiz_sync_push(1, '{"bookmarks":{"value":{"a":1}}}'::jsonb, '{}', 'dev-1');
  assert (r->>'unchanged')::boolean, 'same content does not create a version';
  assert (r->>'version')::int = 1;

  -- 5. incremental pull only returns what changed
  r := public.quiz_sync_pull(jsonb_build_object('bookmarks', hash_a));
  assert r->'data' ? 'hist:2026-11' and not (r->'data' ? 'bookmarks'), 'incremental pull skips unchanged sections';

  -- 6. update + delete in one push
  r := public.quiz_sync_push(1, '{"bookmarks":{"value":{"a":3}}}'::jsonb, array['hist:2026-11'], 'dev-1');
  assert (r->>'version')::int = 2;
  assert (r->'applied') ? '-hist:2026-11', 'deletion reported';
  r := public.quiz_sync_pull();
  assert r->'data'->'bookmarks' = '{"a":3}'::jsonb and not (r->'data' ? 'hist:2026-11'), 'state after update + delete';

  -- 7. validation
  r := public.quiz_sync_push(2, '{"bad key!":{"value":1},"noval":{"x":1}}'::jsonb, '{}', 'dev-1');
  assert jsonb_array_length(r->'rejected') = 2, 'invalid key and missing value are rejected';
  assert (r->>'version')::int = 2, 'rejected-only push does not bump the version';

  -- 8. restore points + restore
  r := public.quiz_sync_revisions_list();
  assert jsonb_array_length(r->'revisions') = 2, 'two restore points so far';
  r := public.quiz_sync_restore(1, 'dev-1');
  assert (r->>'restoredFrom')::int = 1 and (r->>'version')::int = 3, 'restore creates a new version';
  assert r->'data'->'bookmarks' = '{"a":1}'::jsonb and r->'data' ? 'hist:2026-11', 'restore brings back the old data';

  -- 9. restore points are capped
  for i in 1..8 loop
    r := public.quiz_sync_pull();
    perform public.quiz_sync_push((r->>'version')::int, jsonb_build_object('n', jsonb_build_object('value', to_jsonb(i))), '{}', 'dev-1');
  end loop;
  select jsonb_array_length(public.quiz_sync_revisions_list()->'revisions') into n;
  assert n = 5, format('only 5 restore points are kept, got %s', n);

  -- 10. size limit & account quota accounting across updates and deletions
  r := public.quiz_sync_pull();
  r := public.quiz_sync_push((r->>'version')::int,
         jsonb_build_object('big', jsonb_build_object('value', to_jsonb(repeat('x', 9 * 1024 * 1024)))), '{}', 'dev-1');
  assert r->'rejected'->0->>'reason' = 'section_too_large', 'oversized section is rejected';

  -- Three 7 MB sections fit inside the 24 MB account limit (21 MB total)
  r := public.quiz_sync_pull();
  r := public.quiz_sync_push((r->>'version')::int,
         jsonb_build_object(
           'q1', jsonb_build_object('value', to_jsonb(repeat('a', 7 * 1024 * 1024))),
           'q2', jsonb_build_object('value', to_jsonb(repeat('b', 7 * 1024 * 1024))),
           'q3', jsonb_build_object('value', to_jsonb(repeat('c', 7 * 1024 * 1024)))
         ), '{}', 'dev-1');
  assert jsonb_array_length(r->'rejected') = 0, '21 MB across three sections fits inside 24 MB quota';

  -- Updating existing sections in-place must compute net delta, not double-count old + new sizes
  r := public.quiz_sync_push((r->>'version')::int,
         jsonb_build_object(
           'q1', jsonb_build_object('value', to_jsonb(repeat('d', 7 * 1024 * 1024))),
           'q4', jsonb_build_object('value', to_jsonb(repeat('e', 2 * 1024 * 1024)))
         ), '{}', 'dev-1');
  assert jsonb_array_length(r->'rejected') = 0, 'in-place update uses net delta so subsequent insert still fits';

  -- Deleting a 7 MB section in the same push frees quota before inserting a replacement 6 MB section
  r := public.quiz_sync_push((r->>'version')::int,
         jsonb_build_object('q5', jsonb_build_object('value', to_jsonb(repeat('f', 6 * 1024 * 1024)))),
         array['q2'], 'dev-1');
  assert jsonb_array_length(r->'rejected') = 0 and (r->'applied') ? '-q2' and (r->'applied') ? 'q5',
         'deletions free quota before upserts in the same push';

  -- Growing an existing section beyond remaining account quota is rejected cleanly
  r := public.quiz_sync_push((r->>'version')::int,
         jsonb_build_object('q4', jsonb_build_object('value', to_jsonb(repeat('g', 6 * 1024 * 1024)))),
         '{}', 'dev-1');
  assert r->'rejected'->0->>'reason' = 'account_quota_exceeded', 'growing an existing section past 24 MB is rejected';

  -- Clean up large test sections
  r := public.quiz_sync_pull();
  perform public.quiz_sync_push((r->>'version')::int, '{}'::jsonb, array['q1', 'q3', 'q4', 'q5'], 'dev-1');

  -- 11. bob never sees alice's data, and cannot write tables directly
  perform pg_temp.as_user(bob);
  select count(*) into n from public.quiz_sync_sections;
  assert n = 0, 'RLS hides other users sections';
  select count(*) into n from public.quiz_sync_revisions;
  assert n = 0, 'RLS hides other users restore points';
  begin
    insert into public.quiz_sync_sections (user_id, key, value, hash) values (bob::uuid, 'k', '{}', 'h');
    assert false, 'direct insert must be denied';
  exception when insufficient_privilege then null; end;
  r := public.quiz_sync_pull();
  assert r->'sections' = '{}'::jsonb, 'bob has his own empty document';

  -- 12. wipe
  perform pg_temp.as_user(alice);
  r := public.quiz_sync_wipe('dev-1');
  assert (r->>'ok')::boolean;
  assert public.quiz_sync_pull()->'sections' = '{}'::jsonb, 'wipe removes every section';

  -- 13. delete my data keeps the login, delete my account removes it
  perform public.quiz_sync_push((public.quiz_sync_pull()->>'version')::int, '{"k":{"value":1}}'::jsonb, '{}', 'dev-1');
  perform public.quiz_delete_my_data();
  perform pg_temp.reset_role();
  assert exists (select 1 from auth.users where id = alice::uuid), 'login survives delete_my_data';
  assert not exists (select 1 from public.quiz_sync_sections where user_id = alice::uuid), 'quiz data removed';
  perform pg_temp.as_user(alice);
  perform public.quiz_sync_pull();      -- the document is recreated lazily
  perform public.quiz_delete_my_account();
  perform pg_temp.reset_role();
  assert not exists (select 1 from auth.users where id = alice::uuid), 'login removed by delete_my_account';
  assert not exists (select 1 from public.quiz_sync_docs where user_id = alice::uuid), 'cascade removed the document';

  -- 14. anonymous callers cannot use the API
  execute 'set role anon';
  begin
    perform public.quiz_sync_pull();
    assert false, 'anon must not be able to call quiz_sync_pull';
  exception when insufficient_privilege then null; end;
  perform pg_temp.reset_role();

  raise notice 'ALL SQL TESTS PASSED';
end $$;
