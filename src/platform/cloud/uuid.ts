/**
 * RFC4122 v4 UUID generator for client-side entity IDs.
 * 
 * Ensures all primary keys (Quiz Attempt IDs, Note IDs, Bookmark IDs, Outbox Item IDs)
 * are generated as UUIDv4 on the client side before saving or syncing. This eliminates
 * duplicate key collisions when multiple offline devices create records concurrently.
 */

export function generateUUID(): string {
  // Use Web Crypto API randomUUID if available (modern browsers, Node 19+, WebView)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Cryptographically strong fallback using getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version to 0100 (v4)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    // Set variant to 10xx (RFC4122)
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Math.random fallback (e.g. legacy environments without Web Crypto)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
