/**
 * Centralized date formatting utility — DD/MM/YYYY format across the app.
 */

/** Format timestamp to DD/MM/YYYY */
export function formatDateDMY(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Format timestamp to DD/MM/YYYY, h:mm a */
export function formatDateTimeDMY(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const date = formatDateDMY(d);
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${date}, ${hours}:${mins} ${ampm}`;
}

/** Format timestamp to DD/MM (short) */
export function formatDateShort(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Get start of day in LOCAL timezone (midnight).
 * Used for "Today" filter comparisons.
 */
export function startOfLocalDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if a timestamp falls on the same local day as the reference date.
 */
export function isSameLocalDay(ts: number, ref: Date = new Date()): boolean {
  const d = new Date(ts);
  return d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();
}

/**
 * Parse a date input value (YYYY-MM-DD) into start-of-day timestamp in local timezone.
 */
export function parseLocalDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/**
 * Parse a date input value (YYYY-MM-DD) into end-of-day timestamp in local timezone.
 */
export function parseLocalDateInputEnd(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
