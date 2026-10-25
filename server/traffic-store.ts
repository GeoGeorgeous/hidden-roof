import fs from 'node:fs/promises';
import path from 'node:path';
import { STEPS, type Day, type Step } from './traffic-count';

// The traffic reader's files (traffic.ts), in DATA_DIR/traffic: <day>.json, a day's counts, kept forever (they
// are small); state.json, where in the log it is and the day's visitor hashes (only until the day ends, owner-only).

/** Where the reader is: the log file (its inode) and how far in it, and the day being counted. */
export interface State {
  inode: number;
  offset: number;
  today: { name: string; salt: string; seen: Record<Step, string[]> } | null;
}

const DAY = /^(\d{4}-\d\d-\d\d)\.json$/;
const read = async <T>(file: string) => JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null')) as T | null;

/** `data` as JSON in `file`, whole or not at all. */
export async function write(file: string, data: unknown, mode = 0o644) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(data), { mode });
  await fs.rename(`${file}.tmp`, file);
}

export const readState = async (dir: string) => {
  const s = await read<State>(path.join(dir, 'state.json'));
  return s && s.today && STEPS.every((k) => Array.isArray(s.today!.seen[k])) ? s : null;
};
export const readDay = (dir: string, name: string) => read<Day>(path.join(dir, `${name}.json`));

/** The last `n` days up to today with a file, oldest first (GET /traffic). */
export async function trafficDays(dir: string, n: number) {
  const first = new Date(Date.now() - (n - 1) * 864e5).toISOString().slice(0, 10);
  const names = (await fs.readdir(path.join(dir, 'traffic')).catch(() => [] as string[])).flatMap((f) => DAY.exec(f)?.[1] ?? []).filter((d) => d >= first).sort();
  const days = await Promise.all(names.map(async (day) => ({ day, ...(await readDay(path.join(dir, 'traffic'), day)) })));
  return { days };
}
