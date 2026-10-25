import { NET, SERVER } from '../src/config';

// A beacon's body as the game sends it (src/beacon.ts), checked: any field of the wrong type, a code that isn't one
// (a-z, 0-9, . and -), a list or a map over its limit, or a number out of range, and it's refused whole.

export const BEATS = ['menu', 'solo', 'session', 'hidden'] as const;
const STEPS = ['play', 'ready', 'sprayed', 'joined'] as const;
const SECONDS = ['playing', 'idle', 'menu'] as const;

interface Body {
  beat?: (typeof BEATS)[number];
  first?: { gpu: string | null; load: number; settings?: Record<string, string> };
  fps?: { avg: number; low1: number };
  joins?: number[];
  errors?: string[];
  erred?: true;
  steps?: (typeof STEPS)[number][];
  tutorial?: string[];
  counts?: Record<string, number>;
  seconds?: Partial<Record<(typeof SECONDS)[number], number>>;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && !!x && !Array.isArray(x);
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
  const { beat, first, fps, joins, errors, erred, steps, tutorial, counts, seconds } = b;
  if (beat !== undefined && !BEATS.includes(beat as never)) return null;
  if (first !== undefined && (!isObj(first) || !(first.gpu === null || isText(first.gpu)) || !isNum(first.load, SERVER.beaconMostSeconds) || (first.settings !== undefined && !isMap(first.settings, isText)))) return null;
  if (fps !== undefined && (!isObj(fps) || !isNum(fps.avg, 1000) || !isNum(fps.low1, 1000))) return null;
  if (!isList(joins, (j) => isNum(j, SERVER.beaconMostSeconds)) || !isList(errors, (e) => typeof e === 'string' && e.length <= NET.beaconErrorChars)) return null;
  if (erred !== undefined && erred !== true) return null;
  if (!isList(steps, (s) => STEPS.includes(s as never)) || !isList(tutorial, isCode)) return null;
  if (counts !== undefined && !isMap(counts, isCount)) return null;
  if (seconds !== undefined && (!isObj(seconds) || !Object.entries(seconds).every(([k, v]) => SECONDS.includes(k as never) && isNum(v, SERVER.beaconMostSeconds)))) return null;
  return b as Body;
}
