import fs from 'node:fs/promises';
import { Reader, type CountryResponse } from 'mmdb-lib';
import { SERVER } from '../src/config';
import { log } from './log';

// A player's country, from their address, looked up once when their link opens
// (main.ts): GEOIP_DB is a country base in the MaxMind format (DB-IP Lite
// Country, which the host downloads monthly; docs/deploy.md). Read again when
// the file changes. No base, no country. Only the country code is kept.

let reader: Reader<CountryResponse> | null = null;
let changed = 0;

async function read(file: string) {
  try {
    const { mtimeMs } = await fs.stat(file);
    if (mtimeMs === changed) return;
    reader = new Reader<CountryResponse>(await fs.readFile(file));
    changed = mtimeMs;
    log('-----', `GeoIP base ${file}: ${reader.metadata.buildEpoch.toISOString().slice(0, 10)}`);
  } catch (e) {
    log('-----', `GeoIP base ${file} not read:`, (e as Error).message);
  }
}

/** Read `file`, and again whenever it changes (checked every SERVER.geoipCheck s). */
export async function geoip(file: string) {
  await read(file);
  setInterval(() => void read(file), SERVER.geoipCheck * 1000).unref();
}

/** When the base in use was built, or null (no base). */
export const geoipBuilt = () => reader?.metadata.buildEpoch.getTime() ?? null;

/** The two-letter country code of `ip`, or null. */
export function countryOf(ip: string): string | null {
  try {
    return reader?.get(ip.replace(/^::ffff:/, ''))?.country?.iso_code ?? null;
  } catch {
    return null;
  }
}
