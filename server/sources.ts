import { NET, SERVER } from '../src/config';
import { lastBeacon } from './beacon';
import { iso } from './days';
import { geoipBuilt } from './geoip';
import { history } from './history';
import { trafficAt } from './traffic-store';

// How fresh each figure on the admin page is (GET /, admin/server.ts): for each source, how often it comes (s) and when
// the last one did (ISO, null: never). The page makes the words.

const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms));

/** `dir`: DATA_DIR, for the traffic reader's files. */
export async function sources(dir: string | null) {
  return {
    // The stream's status is built each time it goes out.
    status: { every: SERVER.adminStatus, at: isoOrNull(Date.now()) },
    beacon: { every: NET.beaconEvery, at: isoOrNull(lastBeacon()) },
    // The hours are counted as they happen and written each SERVER.historyEvery s.
    history: { every: SERVER.historyEvery, at: isoOrNull(history.savedAt) },
    traffic: { every: SERVER.trafficEvery, at: isoOrNull(dir ? await trafficAt(dir) : null) },
    geoip: { every: SERVER.geoipEvery, at: isoOrNull(geoipBuilt()) },
  };
}
