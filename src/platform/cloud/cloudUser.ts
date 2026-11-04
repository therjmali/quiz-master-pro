/** Holder for the signed-in cloud user, so the sync engine never imports the auth module (no cycles). */
export interface CloudUser { id: string; email: string; name: string }

let current: CloudUser | null = null;

export function setCloudUser(user: CloudUser | null): void { current = user; }
export function getCloudUser(): CloudUser | null { return current; }
