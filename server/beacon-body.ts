import { NET, SERVER } from '../src/config';
import type { NetReport } from '../src/net/net-minute';
import { isDevice } from '../src/net/protocol';

// A beacon's body as the game sends it (src/beacon.ts), checked: any field of the wrong type, a code that isn't one
// (a-z, 0-9, . and -), a list or a map over its limit, or a number out of range, and it's refused whole.

export const BEATS = ['menu', 'solo', 'session', 'hidden'] as const;
const STEPS = ['play', 'ready', 'sprayed', 'joined'] as const;
const SECONDS = ['playing', 'idle', 'menu'] as const;

interface Body {
  /** The page load's random id (crypto.randomUUID), and `bye`: the page is gone (pagehide). */
  page?: string;
  bye?: true;
  beat?: (typeof BEATS)[number];
  first?: { gpu: string | null; load: number; settings?: Record<string, string>; device?: string };
  fps?: { avg: number; low1: number };
  joins?: number[];
  errors?: string[];
  erred?: true;
  steps?: (typeof STEPS)[number][];
  tutorial?: string[];
  counts?: Record<string, number>;
  seconds?: Partial<Record<(typeof SECONDS)[number], number>>;
  net?: NetReport;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && !!x && !Array.isArray(x);
const isPage = (x: unknown) => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
const isNum = (x: unknown, most: number) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= most;
const isText = (x: unknown) => typeof x === 'string' && x.length <= SERVER.beaconText;
const isCode = (x: unknown) => typeof x === 'string' && /^[a-z0-9.-]{1,40}$/.test(x);
const isList = (x: unknown, ok: (v: unknown) => boolean) => x === undefined || (Array.isArray(x) && x.length <= NET.beaconList && x.every(ok));
/** A map of at most SERVER.beaconKinds keys, each a code, each value `ok`. */
const isMap = (x: unknown, ok: (v: unknown) => boolean) => isObj(x) && Object.keys(x).length <= SERVER.beaconKinds && Object.entries(x).every(([k, v]) => isCode(k) && ok(v));
const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SERVER.beaconMostEvents;

/** `b` as a Body, or null. */
export function check(b: unknown) {
  if (!isObj(b)) return null;
  const { page, bye, beat, first, fps, joins, errors, erred, steps, tutorial, counts, seconds, net } = b;
  if (page !== undefined && !isPage(page)) return null;
  if (bye !== undefined && bye !== true) return null;
  if (beat !== undefined && !BEATS.includes(beat as never)) return null;
  if (first !== undefined && (!isObj(first) || !(first.gpu === null || isText(first.gpu)) || !isNum(first.load, SERVER.beaconMostSeconds) || (first.settings !== undefined && !isMap(first.settings, isText)) || !isDevice(first.device))) return null;
  if (fps !== undefined && (!isObj(fps) || !isNum(fps.avg, 1000) || !isNum(fps.low1, 1000))) return null;
  if (!isList(joins, (j) => isNum(j, SERVER.beaconMostSeconds)) || !isList(errors, (e) => typeof e === 'string' && e.length <= NET.beaconErrorChars)) return null;
  if (erred !== undefined && erred !== true) return null;
  if (!isList(steps, (s) => STEPS.includes(s as never)) || !isList(tutorial, isCode)) return null;
  if (counts !== undefined && !isMap(counts, isCount)) return null;
  if (seconds !== undefined && (!isObj(seconds) || !Object.entries(seconds).every(([k, v]) => SECONDS.includes(k as never) && isNum(v, SERVER.beaconMostSeconds)))) return null;
  if (net !== undefined && !isNet(net)) return null;
  return b as Body;
}

/** The session link's minute (src/net/net-minute.ts). */
function isNet(n: unknown) {
  if (!isObj(n) || !isNum(n.seconds, SERVER.beaconMostSeconds) || !isNum(n.down, SERVER.beaconMostRate) || !isNum(n.up, SERVER.beaconMostRate)) return false;
  const ping = n.ping;
  if (ping !== undefined && (!isObj(ping) || !['p50', 'p95', 'max'].every((k) => isNum(ping[k], SERVER.beaconMostPing)))) return false;
  if (n.drops !== undefined && !isMap(n.drops, isCount)) return false;
  if (n.stalls !== undefined && !(Number.isInteger(n.stalls) && isNum(n.stalls, SERVER.beaconMostEvents))) return false;
  return isList(n.back, (s) => isNum(s, SERVER.beaconMostSeconds)) && isList(n.stallLong, (s) => isNum(s, SERVER.beaconMostSeconds));
}
