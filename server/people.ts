import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { prefix } from './address';
import { writeAtomic } from './atomic';
import { readDays, writeDays } from './audience';
import { dayAt, dayName, dayOfFile, hourAt, HOUR, today } from './days';
import { readJson } from './json-file';
import { log } from './log';
import { MonthSalt } from './month-salt';
import { count, dayFigures, dayRow, type Play, type Row } from './people-count';

// Unique people for the admin's history (history.ts). Each play that starts (a
// JOIN) or page that reaches the level (the beacon's first message) is kept as
// its hour, its device id (the game's, stored.ts) and its address (an IPv6 one by
// its /64, which a device keeps while the rest changes), both only as salted
// hashes, and its country, and whether it was a JOIN, a page or both. The salt
// changes at each month's start (UTC) and is never logged or sent; when it began is kept
// (stats/salt.json). The plays are kept SERVER.historyDays, a file a day
// (stats/people-<day>.json), then deleted; each ended day's counts are kept for good
// (audience.ts). Players are counted by device and by address (people-count.ts).

const fileOf = (day: number) => `people-${dayName(day)}.json`;
const dayOf = (name: string) => dayOfFile(name, 'people-', '.json');

class People {
  private plays: Play[] = [];
  /** A play in the same hour from the same device and address is the same. */
  private seen = new Map<string, Play>();
  /** New people from pages this hour (SERVER.peoplePages at most), and from each address (SERVER.peoplePagesPerIp). */
  private pages = { h: 0, n: 0, ips: new Map<string, number>() };
  private salt = new MonthSalt();
  private saltChanged = false;
  /** The days (since 1970) each device joined a session since the salt began, by its hash: for seenDays. */
  private days = new Map<string, Set<number>>();
  private dir: string | null = null;
  private dirty = new Set<number>();

  /** The ended days whose counts are written (audience.ts), and the day they were last looked for. */
  private written = new Set<number>();
  private checked = -1;

  /** A play started (`how`: 'join'), or a page reached the level ('page'), from `device` (none from an older game) at `ip`. `days`: what the game says of the device's days (src/stored.ts). */
  played(device: string | undefined, ip: string, country: string | null, how: 'join' | 'page', days?: { first: number | null; prev: number | null }) {
    this.renew();
    const p: Play = { h: hourAt(Date.now()), d: device ? this.salt.id(`d${device}`) : null, i: this.salt.id(`i${prefix(ip)}`), c: country };
    if (days && device) [p.f, p.v] = [days.first, days.prev];
    const key = `${p.h} ${p.d} ${p.i}`;
    const had = this.seen.get(key);
    const flag = how === 'join' ? 'j' : 'p';
    if (had) {
      const said = p.f !== undefined && had.f === undefined;
      if (!had[flag] || said) {
        had[flag] = true;
        had.c ??= p.c;
        if (said) [had.f, had.v] = [p.f, p.v];
        this.dirty.add(Math.floor(p.h / 24));
        this.index(had);
      }
      return;
    }
    if (how === 'page') {
      if (this.pages.h !== p.h) this.pages = { h: p.h, n: 0, ips: new Map() };
      const mine = this.pages.ips.get(p.i) ?? 0;
      if (this.pages.n >= SERVER.peoplePages || mine >= SERVER.peoplePagesPerIp) return;
      this.pages.n++;
      this.pages.ips.set(p.i, mine + 1);
    }
    p[flag] = true;
    this.seen.set(key, p);
    this.plays.push(p);
    this.index(p);
    this.dirty.add(Math.floor(p.h / 24));
  }

  /** The people of hours `first` up to `end` (distinct within one range: a person seen before and after a salt change counts twice there). */
  count(first: number, end: number) {
    return count(this.plays, first, end);
  }

  /** The people of one day (hours `first` up to `end`): players and those who joined, new, returning and unknown. */
  day(first: number, end: number) {
    return dayFigures(this.plays, first, end);
  }

  /** The row of each day from `from` to `to` (since 1970) that had players, at `now` (ms): ended days as written, today's from the plays now. */
  async rows(from: number, to: number, now: number) {
    const today = dayAt(now);
    const kept = this.dir ? await readDays(this.dir, from, Math.min(to, today - 1)) : new Map();
    const rows = new Map<number, Row>();
    for (let d = from; d <= to; d++) {
      const row = kept.get(d) ?? dayRow(this.plays, d);
      if (row) rows.set(d, row);
    }
    return rows;
  }

  /** The days this device (as the game knows it) joined a session since the salt began, or null without one. */
  seenDays(device: string | undefined) {
    return device ? (this.days.get(this.salt.id(`d${device}`))?.size ?? 0) : null;
  }

  /** Keep them in `dir` (stats/): the salt and the last SERVER.historyDays read back, older days deleted. */
  async keepIn(dir: string) {
    this.dir = dir;
    const salt = await readSalt(path.join(dir, 'salt.json'));
    if (salt) this.salt = new MonthSalt(salt);
    else this.saltChanged = true;
    this.renew();
    const keep = today() - SERVER.historyDays;
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
    await this.keepRows();
  }

  /** The days that changed written, plays past SERVER.historyDays forgotten (and their files deleted). History saves it once a minute. */
  async save() {
    const keep = today() - SERVER.historyDays;
    const old = this.plays.findIndex((p) => p.h >= keep * 24);
    if (old !== 0) {
      const gone = this.plays.splice(0, old < 0 ? this.plays.length : old);
      for (const p of gone) (this.seen.delete(`${p.h} ${p.d} ${p.i}`), this.unindex(p));
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
    await this.keepRows();
  }

  /** The key of a month past is gone with its first play of the next (the hashes of its plays are made already). */
  private renew() {
    if (this.salt.renew(Date.now())) [this.saltChanged, this.days] = [true, new Map()];
  }

  /** Each ended day's row written once (audience.ts): at load all that are missing, then when a new day has begun. */
  private async keepRows() {
    const now = today();
    if (!this.dir || this.checked === now) return;
    const missing = new Map<number, Row>();
    for (const day of new Set(this.plays.map((p) => Math.floor(p.h / 24)))) {
      const row = day < now && !this.written.has(day) ? dayRow(this.plays, day) : null;
      if (row) missing.set(day, row);
    }
    for (const day of await writeDays(this.dir, missing)) this.written.add(day);
    this.checked = now;
  }

  private add(p: Play) {
    this.seen.set(`${p.h} ${p.d} ${p.i}`, p);
    this.plays.push(p);
    this.index(p);
  }

  /** A join of a device with the salt in use is a day it played. */
  private index(p: Play) {
    if (!p.d || (!p.j && p.p) || (p.h + 1) * HOUR <= this.salt.since) return;
    const days = this.days.get(p.d) ?? new Set<number>();
    this.days.set(p.d, days.add(Math.floor(p.h / 24)));
  }

  private unindex(p: Play) {
    const days = p.d ? this.days.get(p.d) : undefined;
    if (!days) return;
    days.delete(Math.floor(p.h / 24));
    if (!days.size) this.days.delete(p.d!);
  }
}

/** The salt in `file`, or null for none: a file that can't be read is logged and kept aside as <file>.bad, and a new salt begins. */
async function readSalt(file: string) {
  try {
    const salt = await readJson<{ key?: unknown; since?: unknown; starts?: unknown }>(file);
    if (!salt) return null;
    // A file from before the month's salt kept a list of when each began: the last is the one in use.
    const since = Array.isArray(salt.starts) ? salt.starts[salt.starts.length - 1] : salt.since;
    if (typeof salt.key === 'string' && Number.isFinite(since)) return { key: salt.key, since: since as number };
    throw new Error('no key and start in it');
  } catch (e) {
    log('-----', `stats salt.json is no use, a new one begins (the old one is kept as salt.json.bad):`, e);
    await fs.rename(file, `${file}.bad`).catch(() => {});
    return null;
  }
}

/** `data` as JSON in `file`, only the owner may read it, whole or not at all. */
const write = (file: string, data: unknown) => writeAtomic(file, JSON.stringify(data), 0o600);

export const people = new People();
