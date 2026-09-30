const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: process.env.APP_TIMEZONE ?? "Europe/London" });

export function formatDateTime(d: Date): string {
  return fmt.format(d);
}

export function Time({ date }: { date: Date }) {
  return <time dateTime={date.toISOString()}>{formatDateTime(date)}</time>;
}
