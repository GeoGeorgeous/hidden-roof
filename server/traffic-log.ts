import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { add, blank, dayName, fresh, parse, STEPS, type Step, type Today } from './traffic-count';
import { readDay, readState, write, type State } from './traffic-store';

// One pass of the traffic reader (traffic.ts): the lines Caddy added to its access log since the last pass, counted
// (traffic-count.ts) into the day files. A last line still being written waits for the next pass. A log that was
// rotated (a new inode, or shorter than where we were) is read from its start: whatever the old file got after
// the last pass is lost, at most a minute of lines.

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

/** `from`'s steps, each changed by `f`. */
const each = <A, B>(from: Record<Step, A>, f: (a: A) => B) => Object.fromEntries(STEPS.map((k) => [k, f(from[k])])) as Record<Step, B>;

export async function pass(o: Options) {
  const file = await fs.open(o.log, 'r').catch(() => null);
  if (!file) return;
  try {
    await fs.mkdir(o.dir, { recursive: true });
    const { ino, size } = await file.stat();
    let state = await readState(o.dir);
    if (state && (state.inode !== ino || size < state.offset)) state = { ...state, offset: 0 };
    let today: Today | null = null;
    if (state?.today) {
      const { name, salt, seen } = state.today;
      today = { name, salt, seen: each(seen, (hashes) => new Set(hashes)), day: { ...blank(), ...(await readDay(o.dir, name)) } };
    }
    let changed = false;
    const flush = async () => {
      if (today && changed) await write(path.join(o.dir, `${today.name}.json`), today.day);
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
        today = fresh(name);
      }
      changed = add(today, hit, o.hosts, o.country ?? (() => null)) || changed;
    };

    let pos = state?.offset ?? 0;
    let rest = Buffer.alloc(0);
    for (const buf = Buffer.alloc(SERVER.trafficChunk); pos < size; ) {
      const { bytesRead } = await file.read(buf, 0, Math.min(buf.length, size - pos), pos);
      if (!bytesRead) break;
      pos += bytesRead;
      rest = Buffer.concat([rest, buf.subarray(0, bytesRead)]);
      const end = rest.lastIndexOf(10);
      if (end < 0) continue;
      for (const text of rest.subarray(0, end).toString().split('\n')) await line(text);
      rest = rest.subarray(end + 1);
    }
    await flush();
    const next: State = {
      inode: ino,
      offset: pos - rest.length,
      today: today && { name: today.name, salt: today.salt, seen: each(today.seen, (hashes) => [...hashes]) },
    };
    await write(path.join(o.dir, 'state.json'), next, 0o600);
  } finally {
    await file.close();
  }
}
