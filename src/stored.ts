// localStorage where the browser allows it. Unavailable (a private window,
// site data blocked), reads give null and writes are dropped: whatever it
// keeps lasts for this session only.

import { isDevice } from './net/protocol.ts';

export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let device: string | undefined;
/** This load made the device id, not read it. */
let made = false;

/** This browser's random id, sent with HOST and JOIN: the admin's history counts people by it (and by address). Kept for the session where storage is blocked. */
export function deviceId() {
  const kept = stored('roofhiddenhaus.device');
  // A value that is no device id (edited by hand, or an older form) would fail every HOST, JOIN and beacon: a new device.
  device ??= typeof kept === 'string' && isDevice(kept) ? kept : undefined;
  if (!device) store('roofhiddenhaus.device', ((made = true), (device = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join(''))));
  return device;
}

export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Unavailable: see above.
  }
}

/** The UTC days (since 1970) a device first played, last played, and played before that. */
interface Kept {
  first: number | null;
  last: number | null;
  prev: number | null;
}

const DAYS = 'roofhiddenhaus.days';
const isDay = (x: unknown): x is number | null => x === null || (typeof x === 'number' && Number.isInteger(x) && x >= 0);

/** `kept` (as stored, or none) on `today` (a day since 1970): the days to keep now, and the first day and the last day played before today to send. A device with no first day that this load didn't make never gets one. */
export function nextDays(kept: Partial<Kept> | null, today: number, made: boolean) {
  // A clock set back leaves days in the future: they are today.
  const day = (d: number | null | undefined) => (d == null ? null : Math.min(d, today));
  const last = day(kept?.last);
  const prev = last === today ? day(kept?.prev) : last;
  const first = day(kept?.first) ?? (made ? today : null);
  return { keep: { first, last: today, prev }, send: { first, prev } };
}

let days: Kept | undefined;

/** The days to send with the first beacon, `{ first, prev }` (docs/admin-api.md, History): kept in localStorage beside the device id, for the session where storage is blocked. */
export function playDays() {
  deviceId();
  if (!days) {
    try {
      const kept = JSON.parse(stored(DAYS) ?? 'null') as Partial<Kept> | null;
      days = kept && isDay(kept.first) && isDay(kept.last) && isDay(kept.prev) ? (kept as Kept) : undefined;
    } catch {
      days = undefined;
    }
  }
  const { keep, send } = nextDays(days ?? null, Math.floor(Date.now() / 864e5), made);
  days = keep;
  store(DAYS, JSON.stringify(keep));
  return send;
}
