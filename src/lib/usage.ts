const DAY_MS = 86_400_000;

/** The longest window GET /usage takes (usageWindow in vws-console-api internal/surface/console/usage.go). */
const MAX_DAYS = 366;

/** `from` is the first day and `to` the day after the last one, both YYYY-MM-DD in UTC, as GET /usage takes them. */
export type UsageWindow = { from: string; to: string };

/** UTC midnight of a YYYY-MM-DD date, or null for any other text and for a day that is not on the calendar. */
function dayStart(text: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== text ? null : time;
}

/** console-api's own rule for the window, so one it would refuse never leaves the console. */
export function usageWindow(from: unknown, to: unknown): UsageWindow | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const start = dayStart(from);
  const end = dayStart(to);
  if (start === null || end === null || start >= end || end - start > MAX_DAYS * DAY_MS) return null;
  return { from, to };
}
