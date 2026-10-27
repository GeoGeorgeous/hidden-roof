import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { log } from './log';
import { add, blank, dayName, fresh, newSalt, parse, type Today } from './traffic-count';
import { pruneHours, readDay, readHours, readState, write, writeHours, type State } from './traffic-store';

// One pass of the traffic reader (traffic.ts): the lines Caddy added to its access log since the last pass, counted
// (traffic-count.ts) into the day files. A last line still being written waits for the next pass. A log that was
// rolled (a new inode) is read from its start, after the rest of the old file if it is still beside it (Caddy
// renames it there); one cut shorter than where we were is read from its start. The day being counted is
// today's: its hours (their visitors' hashes) are written beside its counts, and when it is over it is forgotten
// with the first pass after midnight, not with the first line of the next day.
//
// A crash between a day file and state.json counts the lines of that pass twice on the next one: rare, and a few
// views over, never lost; making the two one write would cost more than it is worth.

export interface Options {
  /** Caddy's access log. */
  log: string;
  /** DATA_DIR/traffic. */
  dir: string;
  /** Our own hosts (lowercase); only requests to them count, none: every host. */
  hosts: string[];
  /** The address's country, if known (GEOIP_DB). */
  country?: (ip: string) => string | null;
}

/** Whether the log was missing at the last pass: said once when it goes, and once when it is back. */
let missing = false;

export async function pass(o: Options) {
  const file = await fs.open(o.log, 'r').catch(() => null);
  if (!file) {
    if (!missing) log('-----', `traffic: ${o.log} can't be read, waiting for it`);
    missing = true;
    return;
  }
  if (missing) log('-----', `traffic: ${o.log} is back`);
  missing = false;
  try {
    await fs.mkdir(o.dir, { recursive: true });
    const { ino, size } = await file.stat();
    const state = await readState(o.dir);
    // The visitors' salt lasts SERVER.saltDays; a new one starts the visitors again (as people.ts's does).
    const salt = state?.salt && Date.now() - state.salt.since <= SERVER.saltDays * 864e5 ? state.salt : { key: newSalt(), since: Date.now() };
    let today: Today | null = null;
    if (state?.today) {
      today = fresh(state.today, salt.key, await readHours(o.dir, state.today));
      today.day = { ...blank(), ...(await readDay(o.dir, state.today)) };
    }
    let changed = false;
    /** Views of the day's file when the day was started here from nothing (no state for it): a recount of what the log still holds is kept only if it isn't less. */
    let had = 0;
    const flush = async () => {
      if (today && changed && today.day.views >= had) {
        await write(path.join(o.dir, `${today.name}.json`), today.day);
        await writeHours(o.dir, today.name, today.hours);
      }
      changed = false;
    };
    const line = async (text: string) => {
      const hit = parse(text);
      if (!hit) return;
      const name = dayName(hit.ts);
      // A line from before the day being counted (out of order at midnight) is dropped: its visitors are gone.
      if (today && name < today.name) return;
      if (!today || name > today.name) {
        await flush();
        today = fresh(name, salt.key);
        had = (await readDay(o.dir, name))?.views ?? 0;
      }
      changed = add(today, hit, o.hosts, o.country ?? (() => null)) || changed;
    };

    /** `f`'s whole lines from `pos` to `size`: where the last whole one ends. */
    const read = async (f: fs.FileHandle, pos: number, size: number) => {
      let rest = Buffer.alloc(0);
      for (const buf = Buffer.alloc(SERVER.trafficChunk); pos < size; ) {
        const { bytesRead } = await f.read(buf, 0, Math.min(buf.length, size - pos), pos);
        if (!bytesRead) break;
        pos += bytesRead;
        rest = Buffer.concat([rest, buf.subarray(0, bytesRead)]);
        const end = rest.lastIndexOf(10);
        if (end < 0) continue;
        for (const text of rest.subarray(0, end).toString().split('\n')) await line(text);
        rest = rest.subarray(end + 1);
      }
      return pos - rest.length;
    };

    let from = state?.offset ?? 0;
    if (state && state.inode !== ino) {
      const old = await rolled(path.dirname(o.log), state.inode);
      if (old) await read(old, state.offset, (await old.stat()).size).finally(() => old.close());
      from = 0;
    } else if (size < from) from = 0;
    const offset = await read(file, from, size);
    await flush();
    // The day is over: it is not counted past the first pass that sees it.
    if (today && dayName(Date.now() / 1000) > today.name) today = null;
    await pruneHours(o.dir);
    const next: State = { inode: ino, offset, salt, today: today?.name ?? null };
    await write(path.join(o.dir, 'state.json'), next, 0o600);
  } finally {
    await file.close();
  }
}

/** The file in `dir` with inode `ino` (the log as it was before it rolled), open, or null. */
async function rolled(dir: string, ino: number) {
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const f = path.join(dir, name);
    if ((await fs.stat(f).catch(() => null))?.ino === ino) return fs.open(f, 'r').catch(() => null);
  }
  return null;
}
