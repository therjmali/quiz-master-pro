/** Friendly name for the header and chat: the saved name, else the e-mail prefix, else ''. */
export function accountName(name: string | undefined, email: string | undefined): string {
  const n = (name ?? '').trim();
  if (n) return n;
  const e = (email ?? '').trim();
  return e ? e.split('@')[0] : '';
}
