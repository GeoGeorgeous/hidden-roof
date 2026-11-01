// Days and hours since 1970 (UTC), as the history counts them: the units, their names (YYYY-MM-DD) and the files named by them.

export const HOUR = 3600e3;
export const DAY = 24 * HOUR;

export const iso = (ms: number) => new Date(ms).toISOString();
/** The day (since 1970) of `ms`. */
export const dayAt = (ms: number) => Math.floor(ms / DAY);
/** The hour (since 1970) of `ms`. */
export const hourAt = (ms: number) => Math.floor(ms / HOUR);
/** The day now. */
export const today = () => dayAt(Date.now());
/** `day` (since 1970) as YYYY-MM-DD. */
export const dayName = (day: number) => iso(day * DAY).slice(0, 10);

/** `name` (YYYY-MM-DD, a real date from 1970 on) as a day since 1970, or null. */
export function dayOf(name: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(name)) return null;
  const day = Date.parse(name) / DAY;
  return Number.isInteger(day) && day >= 0 && dayName(day) === name ? day : null;
}

/** The day (since 1970) of a file named `<before>YYYY-MM-DD<after>`, or null. */
export function dayOfFile(file: string, before: string, after: string) {
  return file.startsWith(before) && file.endsWith(after) ? dayOf(file.slice(before.length, file.length - after.length)) : null;
}

/** The hours of the day `now` (ms) is in, up to its own hour included (hours since 1970): `end` is the one after. */
export function todaySpan(now: number) {
  const end = hourAt(now) + 1;
  return { first: Math.floor((end - 1) / 24) * 24, end };
}
