import path from 'node:path';
import { SERVER } from '../src/config';
import { countryOf, geoip } from './geoip';
import { log } from './log';
import { pass } from './traffic-log';

// The traffic reader: its own process and container (roof-traffic, from the game's image: node traffic.js), never in
// the game server. Every SERVER.trafficEvery s it counts what Caddy added to its access log into daily counts in
// DATA_DIR/traffic, which the game's admin API serves (GET /traffic, admin-api.ts). Only counts are kept, and
// hashes of the day's visitors until the day ends (traffic-count.ts); no address, no browser name.
//   CADDY_LOG     Caddy's access log, JSON, one object per line
//   DATA_DIR      where the counts go (traffic/), shared with the game server
//   TRAFFIC_HOSTS comma-separated: only requests to these hosts count; none: every host
//   GEOIP_DB      the country base (geoip.ts); none: no countries

const [file, data] = [process.env.CADDY_LOG, process.env.DATA_DIR];
if (!file || !data) {
  log('-----', 'CADDY_LOG and DATA_DIR are needed');
  process.exit(1);
}
const hosts = (process.env.TRAFFIC_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
if (process.env.GEOIP_DB) await geoip(process.env.GEOIP_DB);

// A pass that takes long doesn't overlap the next. In a container this is PID 1, which has no default signal handlers.
async function run() {
  try {
    await pass({ log: file!, dir: path.join(data!, 'traffic'), hosts, country: countryOf });
  } catch (e) {
    log('-----', 'traffic not counted:', e);
  }
  setTimeout(() => void run(), SERVER.trafficEvery * 1000);
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));
log('-----', `traffic reader: ${file}${hosts.length ? ` for ${hosts.join(', ')}` : ''}`);
await run();
