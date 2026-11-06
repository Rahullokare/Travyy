/** A calendar day as `YYYY-MM-DD` in the phone's own time zone, where the money was spent. */
export function localDay(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function daysAgo(days: number, from = new Date()): string {
  return localDay(new Date(from.getFullYear(), from.getMonth(), from.getDate() - days));
}

function toDate(day: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return undefined;
  const [year, month, date] = match.slice(1).map(Number);
  const value = new Date(year, month - 1, date);
  // Catches rollovers such as 2026-02-31 becoming 3 March.
  return value.getMonth() === month - 1 && value.getDate() === date ? value : undefined;
}

export function isValidDay(day: string): boolean {
  return !!toDate(day);
}

/** "Fri, 6 Nov" in the phone's language; the raw text if it isn't a real date. */
export function formatDay(day: string): string {
  return (
    toDate(day)?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) ?? day
  );
}
