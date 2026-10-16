const creationDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h12",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** Absolute UTC time, matching the console clock rather than the viewer's zone. */
export function formatBucketCreationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return creationDate.format(date);
}
