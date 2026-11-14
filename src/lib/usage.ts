const DAY_MS = 86_400_000;

/** The longest window GET /usage takes (usageWindow in vws-console-api internal/surface/console/usage.go). */
const MAX_DAYS = 366;

export const WINDOW_RULE = `The To date must be on or after the From date, and the range at most ${MAX_DAYS} days.`;

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

const day = (time: number) => new Date(time).toISOString().slice(0, 10);

/** `date` moved by whole days. `date` must be a real YYYY-MM-DD day. */
export const addDays = (date: string, days: number) => day(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);

/** The `count` calendar months before the month of `today`. The current month is left out, as in Cost Explorer. */
export function lastMonths(today: string, count: number): UsageWindow {
  const [year, month] = today.split("-").map(Number);
  return { from: day(Date.UTC(year, month - 1 - count, 1)), to: day(Date.UTC(year, month - 1, 1)) };
}

/** AWS Cost Explorer's ranges for past costs, under its names and by its definitions. Days are UTC days. */
export function usagePresets(today: string): (UsageWindow & { label: string })[] {
  const tomorrow = addDays(today, 1);
  return [
    { label: "Last 1 Day", from: addDays(today, -1), to: today },
    { label: "Last 7 Days", from: addDays(today, -7), to: today },
    { label: "Last 3 Months", ...lastMonths(today, 3) },
    { label: "Last 6 Months", ...lastMonths(today, 6) },
    { label: "Last 12 Months", ...lastMonths(today, 12) },
    { label: "Month to Date", from: `${today.slice(0, 8)}01`, to: tomorrow },
    { label: "Year to Date", from: `${today.slice(0, 5)}01-01`, to: tomorrow },
  ];
}

/** The window for a first and a last day that are both included, which is how a person reads a date range. */
export function inclusiveWindow(from: string, last: string): UsageWindow | null {
  return dayStart(last) === null ? null : usageWindow(from, addDays(last, 1));
}

/** "2026-05-01 — 2026-10-31": a window by its first and last day, as the AWS console writes a date range. */
export const rangeLabel = ({ from, to }: UsageWindow) => `${from} — ${addDays(to, -1)}`;
