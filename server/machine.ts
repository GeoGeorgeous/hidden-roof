import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config';
import { traffic } from './counts';
import { history } from './history';
import { liveMemory } from './log';
import { isWiped, savedAt } from './saves';

// The machine the server runs on, for the admin page (GET /machine). CPU and the bits each way are
// averages over the last sample (once a minute, minutes.ts), the same for every caller; today's bytes are the history's. The paint saves' bytes count every file; their `last` is the newest
// that isn't one a wipe set aside.

const cpuTimes = () => {
  let busy = 0;
  let all = 0;
  for (const { times: t } of os.cpus()) {
    const sum = t.user + t.nice + t.sys + t.idle + t.irq;
    all += sum;
    busy += sum - t.idle;
  }
  return { busy, all };
};

let last = { at: Date.now(), cpu: cpuTimes(), sent: 0, received: 0 };
let rates: { cpu: number; upBits: number; downBits: number } | null = null;

/** The CPU and the bits each way since `last`. */
function measure() {
  const now = { at: Date.now(), cpu: cpuTimes(), sent: traffic.sent, received: traffic.received };
  const all = now.cpu.all - last.cpu.all;
  const secs = (now.at - last.at) / 1000;
  const bits = (bytes: number) => (secs > 0 ? Math.round((bytes * 8) / secs) : 0);
  return { now, cpu: all > 0 ? Math.round(((now.cpu.busy - last.cpu.busy) / all) * 100) : 0, upBits: bits(now.sent - last.sent), downBits: bits(now.received - last.received) };
}

/** The window moves on: what GET /machine says of the rates is now the figures since the last sample. */
export function sampleMachine() {
  const { now, ...r } = measure();
  [last, rates] = [now, r];
}

/** `dir`: where the paint saves are (DATA_DIR), or null. */
export async function machine(dir: string | null) {
  // Before the first sample: since the start.
  const { cpu, upBits, downBits } = rates ?? measure();
  const disk = await fs.statfs(dir ?? '.');
  const saves = dir ? (await fs.readdir(dir)).filter((n) => n.endsWith('.rhhpaint')) : [];
  // A save rotated away since the listing counts for nothing.
  const sizes = await Promise.all(saves.map((n) => fs.stat(path.join(dir!, n)).then((f) => f.size, () => 0)));
  const newest = saves.filter((n) => !isWiped(n)).reduce((m, n) => Math.max(m, savedAt(n)), 0);
  return {
    cpu: { percent: cpu, vcpus: os.availableParallelism(), load1: os.loadavg()[0] },
    ram: { used: os.totalmem() - os.freemem(), total: os.totalmem() },
    memory: { live: Math.round(liveMemory() * 2 ** 20), limit: SERVER.hostMemory * 2 ** 20 },
    disk: { used: (disk.blocks - disk.bfree) * disk.bsize, total: disk.blocks * disk.bsize },
    saves: { bytes: sizes.reduce((n, b) => n + b, 0), last: newest ? new Date(newest).toISOString() : null },
    upBits,
    downBits,
    today: history.bytesToday(),
  };
}
