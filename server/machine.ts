import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SERVER } from '../src/config';
import { traffic } from './counts';
import { liveMemory } from './log';

// The machine the server runs on, for the admin page (GET /machine): read when
// asked, never sampled in the background. CPU and upload are averages since the
// last ask. The paint saves' bytes count every file; their `last` is the newest
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

let last = { at: Date.now(), cpu: cpuTimes(), sent: 0 };

/** `dir`: where the paint saves are (DATA_DIR), or null. */
export async function machine(dir: string | null) {
  const now = { at: Date.now(), cpu: cpuTimes(), sent: traffic.sent };
  const all = now.cpu.all - last.cpu.all;
  const secs = (now.at - last.at) / 1000;
  const up = secs > 0 ? Math.round(((now.sent - last.sent) * 8) / secs) : 0;
  const cpu = all > 0 ? Math.round(((now.cpu.busy - last.cpu.busy) / all) * 100) : 0;
  last = now;
  const disk = await fs.statfs(dir ?? '.');
  const saves = dir ? (await fs.readdir(dir)).filter((n) => n.endsWith('.rhhpaint')) : [];
  // A save rotated away since the listing counts for nothing.
  const sizes = await Promise.all(saves.map((n) => fs.stat(path.join(dir!, n)).then((f) => f.size, () => 0)));
  const newest = Math.max(0, ...saves.filter((n) => !n.endsWith('.wiped.rhhpaint')).map((n) => parseInt(n.slice(n.indexOf('-') + 1))));
  return {
    cpu: { percent: cpu, vcpus: os.availableParallelism(), load1: os.loadavg()[0] },
    ram: { used: os.totalmem() - os.freemem(), total: os.totalmem() },
    memory: { live: Math.round(liveMemory() * 2 ** 20), limit: SERVER.hostMemory * 2 ** 20 },
    disk: { used: (disk.blocks - disk.bfree) * disk.bsize, total: disk.blocks * disk.bsize },
    saves: { bytes: sizes.reduce((n, b) => n + b, 0), last: newest ? new Date(newest).toISOString() : null },
    upBits: up,
  };
}
