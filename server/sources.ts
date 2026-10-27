import { NET, SERVER } from '../src/config';
import { lastBeacon } from './beacon';
import { geoipBuilt } from './geoip';
import { history } from './history';
import { trafficAt } from './traffic-store';

// How fresh each figure on the admin page is (GET /, admin-api.ts): for each source, how often it comes (s) and when
// the last one did (ISO, null: never). The page makes the words.

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** `dir`: DATA_DIR, for the traffic reader's files. */
export async function sources(dir: string | null) {
  return {
    // The stream's status is built each time it goes out.
    status: { every: SERVER.adminStatus, at: iso(Date.now()) },
    beacon: { every: NET.beaconEvery, at: iso(lastBeacon()) },
    // The hours are counted as they happen and written each SERVER.historyEvery s; the figures are by the hour.
    history: { every: 3600, at: iso(history.savedAt) },
    traffic: { every: SERVER.trafficEvery, at: iso(dir ? await trafficAt(dir) : null) },
    geoip: { every: SERVER.geoipEvery, at: iso(geoipBuilt()) },
  };
}
