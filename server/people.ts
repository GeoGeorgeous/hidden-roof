import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';

// Unique people for the admin's history (history.ts). Each play that starts is
// kept as its hour, its device id (the game's, stored.ts) and its address (an
// IPv6 one by its /64, which a device keeps while the rest changes), both only
// as salted hashes, and its country. The salt changes every SERVER.saltDays and
// is never logged or sent. Plays are kept SERVER.historyDays, a file a day
// (stats/people-<day>.json), then deleted. One person: plays that share a
// device or an address, so a cleared storage or a new address still counts once.

interface Play {
  h: number;
  d: string | null;
  i: string;
  c: string | null;
}

const DAY = 864e5;
const HOUR = 3600e3;
const fileOf = (day: number) => `people-${new Date(day * DAY).toISOString().slice(0, 10)}.json`;
const dayOf = (name: string) => (/^people-(\d{4}-\d\d-\d\d)\.json$/.test(name) ? Date.parse(name.slice(7, 17)) / DAY : null);

/** `ip` as counted: an IPv6 address by its first 64 bits. */
function prefix(ip: string) {
  ip = ip.replace(/^::ffff:/, '').replace(/%.*$/, '');
  if (!ip.includes(':')) return ip;
  const [head, tail] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const all = tail === undefined ? a : [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b];
  return `${all.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

class People {
  private plays: Play[] = [];
  /** A play in the same hour from the same device and address is the same. */
  private seen = new Set<string>();
  private salt = { key: randomBytes(32).toString('hex'), since: Date.now() };
  private saltChanged = false;
  private dir: string | null = null;
  private dirty = new Set<number>();

  /** A play started, from `device` (none from an older game) at `ip`. */
  played(device: string | undefined, ip: string, country: string | null) {
    if (Date.now() - this.salt.since > SERVER.saltDays * DAY) [this.salt, this.saltChanged] = [{ key: randomBytes(32).toString('hex'), since: Date.now() }, true];
    const p: Play = { h: Math.floor(Date.now() / HOUR), d: device ? this.hash(`d${device}`) : null, i: this.hash(`i${prefix(ip)}`), c: country };
    const key = `${p.h} ${p.d} ${p.i}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.plays.push(p);
    this.dirty.add(Math.floor(p.h / 24));
  }

  /** People since hour `first`: merged, by device (plays that carried one), by address; and merged people by country (their last one known). */
  count(first: number) {
    const up = new Map<string, string>();
    const root = (x: string): string => {
      const u = up.get(x) ?? x;
      if (u === x) return x;
      const r = root(u);
      up.set(x, r);
      return r;
    };
    const plays = this.plays.filter((p) => p.h >= first);
    const devices = new Set<string>();
    const ips = new Set<string>();
    for (const p of plays) {
      ips.add(p.i);
      if (!p.d) continue;
      devices.add(p.d);
      const [a, b] = [root(`i${p.i}`), root(`d${p.d}`)];
      if (a !== b) up.set(b, a);
    }
    const country = new Map<string, string | null>();
    for (const p of plays) {
      const who = root(`i${p.i}`);
      if (p.c || !country.has(who)) country.set(who, p.c);
    }
    const countries: Record<string, number> = {};
    for (const c of country.values()) if (c) countries[c] = (countries[c] ?? 0) + 1;
    return { people: { merged: country.size, byDevice: devices.size, byIp: ips.size }, countries };
  }

  /** Keep them in `dir` (stats/): the salt and the last SERVER.historyDays read back, older days deleted. */
  async keepIn(dir: string) {
    this.dir = dir;
    const salt = JSON.parse(await fs.readFile(path.join(dir, 'salt.json'), 'utf8').catch(() => 'null')) as People['salt'] | null;
    if (salt) this.salt = salt;
    else this.saltChanged = true;
    const keep = Math.floor(Date.now() / DAY) - SERVER.historyDays;
    for (const name of await fs.readdir(dir)) {
      const day = dayOf(name);
      if (day === null) continue;
      if (day < keep) await fs.rm(path.join(dir, name));
      else for (const p of JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as Play[]) this.add(p);
    }
    this.plays.sort((a, b) => a.h - b.h);
  }

  /** The days that changed written, plays past SERVER.historyDays forgotten (and their files deleted). History saves it once a minute. */
  async save() {
    const keep = Math.floor(Date.now() / DAY) - SERVER.historyDays;
    const old = this.plays.findIndex((p) => p.h >= keep * 24);
    if (old !== 0) {
      const gone = this.plays.splice(0, old < 0 ? this.plays.length : old);
      for (const p of gone) this.seen.delete(`${p.h} ${p.d} ${p.i}`);
      if (this.dir) for (const day of new Set(gone.map((p) => Math.floor(p.h / 24)))) await fs.rm(path.join(this.dir, fileOf(day)), { force: true });
    }
    if (!this.dir) return this.dirty.clear();
    if (this.saltChanged) await write(path.join(this.dir, 'salt.json'), this.salt);
    this.saltChanged = false;
    const days = [...this.dirty];
    this.dirty.clear();
    try {
      for (const day of days) await write(path.join(this.dir, fileOf(day)), this.plays.filter((p) => Math.floor(p.h / 24) === day));
    } catch (e) {
      for (const day of days) this.dirty.add(day);
      throw e;
    }
  }

  private add(p: Play) {
    this.seen.add(`${p.h} ${p.d} ${p.i}`);
    this.plays.push(p);
  }

  private hash(s: string) {
    return createHash('sha256').update(this.salt.key).update(s).digest('base64url').slice(0, 16);
  }
}

/** `data` as JSON in `file`, only the owner may read it, whole or not at all. */
async function write(file: string, data: unknown) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
}

export const people = new People();
