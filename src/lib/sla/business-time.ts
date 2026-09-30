/**
 * Business-time arithmetic for SLA clocks: Monday–Friday, 09:00–17:00
 * Europe/London, excluding England & Wales bank holidays.
 */

export const BUSINESS_TIMEZONE = "Europe/London";
export const OPEN_MINUTE = 9 * 60;
export const CLOSE_MINUTE = 17 * 60;
export const BUSINESS_DAY_MINUTES = CLOSE_MINUTE - OPEN_MINUTE;

/**
 * England & Wales bank holidays (source: gov.uk/bank-holidays). Extend this
 * list each year, or add dates at runtime with BANK_HOLIDAYS_EXTRA
 * (comma-separated YYYY-MM-DD).
 */
const BANK_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
  // 2028
  "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
]);

function holidays(): Set<string> {
  const extra = process.env.BANK_HOLIDAYS_EXTRA;
  if (!extra) return BANK_HOLIDAYS;
  return new Set([...BANK_HOLIDAYS, ...extra.split(",").map((d) => d.trim()).filter(Boolean)]);
}

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(date: Date): LocalParts {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

/** UTC instant for a wall-clock time in London. */
export function londonTime(year: number, month: number, day: number, minuteOfDay: number): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const offset = (d: number) => {
    const p = localParts(new Date(d));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - d;
  };
  // Two passes settle the offset either side of a DST change.
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

const isoDate = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Business windows (open/close instants) for each London calendar day in turn, starting at `from`'s day. */
function* businessWindows(from: Date, maxDays = 3660): Generator<{ open: Date; close: Date }> {
  const start = localParts(from);
  const hols = holidays();
  // Walk calendar days using a UTC-noon cursor so DST never skips a day.
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day, 12));
  for (let i = 0; i < maxDays; i++, cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6 || hols.has(isoDate(y, m, d))) continue;
    yield { open: londonTime(y, m, d, OPEN_MINUTE), close: londonTime(y, m, d, CLOSE_MINUTE) };
  }
}

const MINUTE = 60_000;

/** Business minutes elapsed between two instants (0 if `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  for (const { open, close } of businessWindows(from)) {
    if (open >= to) break;
    const start = Math.max(open.getTime(), from.getTime());
    const end = Math.min(close.getTime(), to.getTime());
    if (end > start) total += (end - start) / MINUTE;
  }
  return Math.floor(total);
}

/** The instant reached after `minutes` business minutes from `from`. */
export function addBusinessMinutes(from: Date, minutes: number): Date {
  let remaining = Math.max(0, minutes);
  for (const { open, close } of businessWindows(from)) {
    const start = Math.max(open.getTime(), from.getTime());
    if (start >= close.getTime()) continue;
    const available = (close.getTime() - start) / MINUTE;
    if (remaining <= available) return new Date(start + remaining * MINUTE);
    remaining -= available;
  }
  throw new Error("addBusinessMinutes: target is more than 10 years away");
}

/** "2h 15m", "3d 4h" in business time (a business day is 8 hours). */
export function formatBusinessDuration(minutes: number): string {
  const m = Math.round(Math.abs(minutes));
  const days = Math.floor(m / BUSINESS_DAY_MINUTES);
  const hours = Math.floor((m % BUSINESS_DAY_MINUTES) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
