import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { writeAtomic } from './atomic';
import { log } from './log';
import { count, dayFigures, type Play } from './people-count';

// Unique people for the admin's history (history.ts). Each play that starts (a
// JOIN) or page that reaches the level (the beacon's first message) is kept as
// its hour, its device id (the game's, stored.ts) and its address (an IPv6 one by
// its /64, which a device keeps while the rest changes), both only as salted
// hashes, and its country, and whether it was a JOIN, a page or both. The salt
// changes every SERVER.saltDays and is never logged or sent; the times it began
// are kept (stats/salt.json), for SERVER.historyDays. The plays are kept
// SERVER.historyDays, a file a day (stats/people-<day>.json), then deleted.
// Players are counted by device and by address (people-count.ts).

/** The key of the hashes, and when each key began (ms), the one in use last. */
interface Salt {
  key: string;
  starts: number[];
}

const DAY = 864e5;
const HOUR = 3600e3;
const fileOf = (day: number) => `people-${new Date(day * DAY).toISOString().slice(0, 10)}.json`;
const dayOf = (name: string) => (/^people-(\d{4}-\d\d-\d\d)\.json$/.test(name) ? Date.parse(name.slice(7, 17)) / DAY : null);

/** `ip` as counted: an IPv6 address by its first 64 bits. */
export function prefix(ip: string) {
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
  private seen = new Map<string, Play>();
  /** New people from pages this hour (SERVER.peoplePages at most). */
  private pages = { h: 0, n: 0 };
  private salt: Salt = { key: randomBytes(32).toString('hex'), starts: [Date.now()] };
  private saltChanged = false;
  /** The days (since 1970) each device joined a session since the salt began, by its hash: for seenDays. */
  private days = new Map<string, Set<number>>();
  private dir: string | null = null;
  private dirty = new Set<number>();

  /** A play started (`how`: 'join'), or a page reached the level ('page'), from `device` (none from an older game) at `ip`. */
  played(device: string | undefined, ip: string, country: string | null, how: 'join' | 'page') {
    if (Date.now() - this.salt.starts[this.salt.starts.length - 1] > SERVER.saltDays * DAY) {
      this.salt = { key: randomBytes(32).toString('hex'), starts: [...this.salt.starts, Date.now()] };
      [this.saltChanged, this.days] = [true, new Map()];
    }
    const p: Play = { h: Math.floor(Date.now() / HOUR), d: device ? this.hash(`d${device}`) : null, i: this.hash(`i${prefix(ip)}`), c: country };
    const key = `${p.h} ${p.d} ${p.i}`;
    const had = this.seen.get(key);
    const flag = how === 'join' ? 'j' : 'p';
    if (had) {
      if (!had[flag]) (had[flag] = true), (had.c ??= p.c), this.dirty.add(Math.floor(p.h / 24)), this.index(had);
      return;
    }
    if (how === 'page') {
      if (this.pages.h !== p.h) this.pages = { h: p.h, n: 0 };
      if (++this.pages.n > SERVER.peoplePages) return;
    }
    p[flag] = true;
    this.seen.set(key, p);
    this.plays.push(p);
    this.index(p);
    this.dirty.add(Math.floor(p.h / 24));
  }

  /** The people of hours `first` up to `end` (distinct within one range: a person seen before and after a salt change counts twice there). */
  count(first: number, end: number) {
    return count(this.plays, this.salt.starts, first, end);
  }

  /** The people of one day (hours `first` up to `end`): players and those who joined, new and returning. */
  day(first: number, end: number) {
    return dayFigures(this.plays, this.salt.starts, first, end);
  }

  /** The days this device (as the game knows it) joined a session since the salt began, or null without one. */
  seenDays(device: string | undefined) {
    return device ? (this.days.get(this.hash(`d${device}`))?.size ?? 0) : null;
  }

  /** Keep them in `dir` (stats/): the salt and the last SERVER.historyDays read back, older days deleted. */
  async keepIn(dir: string) {
    this.dir = dir;
    const salt = await fs.readFile(path.join(dir, 'salt.json'), 'utf8').then((t) => JSON.parse(t) as { key?: unknown; starts?: unknown; since?: unknown }).catch(() => null);
    // A file from before the starts were kept has only when its key began.
    const starts = Array.isArray(salt?.starts) ? salt.starts : [salt?.since];
    if (typeof salt?.key === 'string' && starts.length && starts.every((s) => Number.isFinite(s))) {
      this.salt = { key: salt.key, starts };
      this.saltChanged = !Array.isArray(salt.starts);
    } else this.saltChanged = true;
    const keep = Math.floor(Date.now() / DAY) - SERVER.historyDays;
    for (const name of await fs.readdir(dir)) {
      const day = dayOf(name);
      if (day === null) continue;
      try {
        if (day < keep) await fs.rm(path.join(dir, name));
        else for (const p of JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) as Play[]) this.add(p);
      } catch (e) {
        log('-----', `stats ${name} skipped:`, e);
      }
    }
    this.plays.sort((a, b) => a.h - b.h);
  }

  /** The days that changed written, plays past SERVER.historyDays forgotten (and their files deleted). History saves it once a minute. */
  async save() {
    const keep = Math.floor(Date.now() / DAY) - SERVER.historyDays;
    const old = this.plays.findIndex((p) => p.h >= keep * 24);
    if (old !== 0) {
      const gone = this.plays.splice(0, old < 0 ? this.plays.length : old);
      for (const p of gone) (this.seen.delete(`${p.h} ${p.d} ${p.i}`), this.unindex(p));
      if (this.dir) for (const day of new Set(gone.map((p) => Math.floor(p.h / 24)))) await fs.rm(path.join(this.dir, fileOf(day)), { force: true });
    }
    // The starts of salts past SERVER.historyDays are forgotten, the one in use never.
    const starts = this.salt.starts.filter((s, i, all) => s >= keep * DAY || i === all.length - 1);
    if (starts.length !== this.salt.starts.length) [this.salt.starts, this.saltChanged] = [starts, true];
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
    this.seen.set(`${p.h} ${p.d} ${p.i}`, p);
    this.plays.push(p);
    this.index(p);
  }

  /** A join of a device with the salt in use is a day it played. */
  private index(p: Play) {
    if (!p.d || (!p.j && p.p) || (p.h + 1) * HOUR <= this.salt.starts[this.salt.starts.length - 1]) return;
    const days = this.days.get(p.d) ?? new Set<number>();
    this.days.set(p.d, days.add(Math.floor(p.h / 24)));
  }

  private unindex(p: Play) {
    const days = p.d ? this.days.get(p.d) : undefined;
    if (!days) return;
    days.delete(Math.floor(p.h / 24));
    if (!days.size) this.days.delete(p.d!);
  }

  private hash(s: string) {
    return createHash('sha256').update(this.salt.key).update(s).digest('base64url').slice(0, 16);
  }
}

/** `data` as JSON in `file`, only the owner may read it, whole or not at all. */
const write = (file: string, data: unknown) => writeAtomic(file, JSON.stringify(data), 0o600);

export const people = new People();
