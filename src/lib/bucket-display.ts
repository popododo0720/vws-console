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

export function formatBucketCreationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return creationDate.format(date);
}
