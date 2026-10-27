import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { levelProblem, type LevelData } from '../src/level/level-data';
import { CODE_LENGTH, CODE_LETTERS, isSessionName, isToolSet, PROTOCOL, type SessionKind } from '../src/net/protocol';
import { SessionStats } from './counts';
import { event } from './events';
import { log, mb } from './log';
import type { Lobby } from './lobby';
import { Busy, Missing, Refused } from './refused';
import { isWiped, leftover, Saves } from './saves';
import type { Session } from './session';
import type { SessionSetup } from './setup';

// The admin's sessions (admin-api.ts), and the public ones kept on disk in
// `dir` (DATA_DIR): sessions.json lists them with what they were made for (the
// protocol, the surface table, the level). Each one's paint is saved every
// SERVER.keepEvery when it changed, and at shutdown, as <code>-<ms>.rhhpaint
// with its stats beside it (saves.ts); after each save the newest stays and the newest
// at least as old as each of SERVER.keepAges (saves.ts keepers). At start each is made again under its code,
// from its newest save that loads, with its stats. The admin's wipe keeps the session's
// saves aside, as <code>-<ms>.wiped.rhhpaint, replacing the last wipe's: never loaded,
// never rotated away by new saves. A new protocol, surface table or level wipes
// it for good, and so does a close: a release that changes none of them keeps the paint.
// The disk work of a write, a wipe, a close and sessions.json goes one task at a time, in
// order, and a failed task is logged: the change it follows has happened (a save that
// failed is tried again at the next one). A session whose level file can't be read for
// another reason than that it isn't there (too many open files, a wrong LEVELS_DIR) is
// left in sessions.json and on disk for the next start.

interface Entry {
  code: string;
  kind: SessionKind;
  name: string;
  limit: number;
  tools: SessionSetup['tools'];
  level: string;
  detail: number;
  protocol: number;
  table: string;
  levelHash: string;
}

const CODE = new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`);
const isEntry = (e: unknown): e is Entry => {
  const o = (typeof e === 'object' && e ? e : {}) as Record<string, unknown>;
  return typeof o.code === 'string' && CODE.test(o.code) && (o.kind === 'public' || o.kind === 'private') && isSessionName(o.name) && isToolSet(o.tools) && typeof o.level === 'string' && Number.isFinite(o.detail) && typeof o.protocol === 'number' && typeof o.table === 'string' && typeof o.levelHash === 'string';
};
const hash = (level: LevelData) => createHash('sha256').update(JSON.stringify(level)).digest('hex').slice(0, 16);

export class Kept {
  /** The save under way (save() never throws), and the disk work in line. */
  private running: Promise<void> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Kept sessions not made again at start for a reason that may pass: still listed. */
  private unmade: Entry[] = [];
  /** Where the saves lie (saves.ts); null keeps nothing on disk. */
  private disk: Saves | null;
  /** Disk tasks under way per session (a save, a wipe, a close, a restore); a restore waits for none, and a wipe or close refuses one under way. */
  private working = new Map<string, number>();
  private restoring = new Set<string>();
  /** The save made of a session's paint before its last restore (the undo), kept besides the age rule until the next restore or a wipe. */
  private undos = new Map<string, number>();

  /** `levels`: where the level files are (LEVELS_DIR); `dir`: null keeps nothing on disk. */
  constructor(
    private lobby: Lobby,
    private levels: string,
    readonly dir: string | null,
  ) {
    this.disk = dir ? new Saves(dir) : null;
  }

  /** levels/<name>.json, checked as a hosted level is. Throws Refused if there's none or it's no good; any other error is the server's. */
  async level(name: string): Promise<LevelData> {
    const none = new Refused(`no level ${JSON.stringify(name)}`);
    if (!/^[a-z0-9-]{1,40}$/.test(name)) throw none;
    const text = await fs.readFile(path.join(this.levels, `${name}.json`), 'utf8').catch((e) => {
      throw e.code === 'ENOENT' ? none : e;
    });
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Refused(`level ${name}: not JSON`);
    }
    const problem = levelProblem(data);
    if (problem) throw new Refused(`level ${name}: ${problem}`);
    return data as LevelData;
  }

  /** A new session of the admin's; a public one is kept. */
  async create(setup: Omit<SessionSetup, 'admin'>, levelName: string, detail: number) {
    const session = this.lobby.create(setup, levelName, await this.level(levelName), detail);
    event('session-made', session, null, { kind: setup.kind, limit: setup.limit, stays: setup.stays });
    await this.record();
    return session;
  }

  /** The admin's wipe: no paint in the session; on disk its saves stay aside, wiped, replacing the last wipe's. */
  async wipe(session: Session) {
    await this.hold(session.code, false, async () => {
      session.wipe();
      this.undos.delete(session.code);
      log(session.code, 'wiped by the admin');
      event('wiped', session);
      if (this.disk) await this.serial(`wipe of ${session.code}`, () => this.disk!.aside(session.code));
    });
  }

  /** The admin closed it: gone, from disk too. */
  async end(session: Session) {
    await this.hold(session.code, false, async () => {
      session.end();
      this.undos.delete(session.code);
      await this.serial(`close of ${session.code}`, () => this.forget(session.code));
    });
    await this.record();
  }

  /** At start: every kept session again, with its paint unless what it was made for has changed. */
  async restore() {
    if (!this.dir) return;
    await fs.mkdir(this.dir, { recursive: true });
    for (const name of (await fs.readdir(this.dir)).filter(leftover)) await fs.rm(this.disk!.file(name), { force: true });
    let list: Entry[] = [];
    try {
      const kept: unknown = JSON.parse(await fs.readFile(this.file('sessions.json'), 'utf8').catch(() => '[]'));
      if (!Array.isArray(kept)) throw new Error('not a list');
      list = kept.filter((e, i) => isEntry(e) || (log('-----', `sessions.json: entry ${i} skipped`), false));
    } catch (e) {
      // Kept aside for a look by hand (each under a name of its own): the paint files stay, the sessions are made again by the admin.
      const bad = `sessions.json.${Date.now()}.bad`;
      log('-----', `sessions.json unreadable, kept as ${bad}:`, e);
      await fs.rename(this.file('sessions.json'), this.file(bad));
    }
    for (const e of list) {
      let session: Session;
      let level: LevelData;
      try {
        level = await this.level(e.level);
      } catch (err) {
        if (err instanceof Refused) {
          log(e.code, `kept session not made again: ${err.message}`);
          await this.forget(e.code);
        } else {
          log(e.code, 'kept session left for the next start:', err);
          this.unmade.push(e);
        }
        continue;
      }
      try {
        session = this.lobby.create({ kind: e.kind, name: e.name, limit: e.limit ?? SERVER.players[e.kind], tools: e.tools, stays: true }, e.level, level, e.detail, e.code);
      } catch (err) {
        log(e.code, `kept session not made again: ${(err as Error).message}`);
        await this.forget(e.code);
        continue;
      }
      const changed = [e.protocol !== PROTOCOL && 'protocol', e.table !== session.table && 'surface table', e.levelHash !== hash(level) && 'level'].filter(Boolean);
      if (changed.length) {
        log(e.code, `paint wiped: a new ${changed.join(', ')}`);
        event('wiped-at-start', session, null, { cause: changed });
        await this.forget(e.code);
        continue;
      }
      for (const name of (await this.disk!.list(e.code)).filter((n) => !isWiped(n)))
        try {
          await session.load(await fs.readFile(this.disk!.file(name)), false);
          session.stats = (await this.disk!.stats(name)) ?? session.stats;
          log(e.code, `paint from ${name}: ${session.memory.now.toFixed(0)} MB`);
          break;
        } catch (err) {
          log(e.code, `paint file ${name} refused: ${(err as Error).message}`);
        }
    }
    await this.record();
  }

  /** Every kept session's paint that changed since its last save (every SERVER.keepEvery, and at shutdown, after a save under way). */
  async save() {
    if (!this.dir) return;
    while (this.running) await this.running;
    await (this.running = this.saveAll().finally(() => (this.running = null)));
  }

  private async saveAll() {
    for (const s of this.public()) if (s.changed && !this.working.get(s.code)) await this.saveOne(s);
  }

  /** `s`'s paint as a new save. `changed` goes down before the paint is read and comes back if no save was made: the next one tries again. */
  private async saveOne(s: Session) {
    s.changed = false;
    try {
      await this.hold(s.code, false, () => this.put(s));
    } catch (e) {
      s.changed = true;
      log(s.code, 'paint not saved:', e);
      event('save-failed', s, null, { why: (e as Error).message });
    }
  }

  /** `s`'s paint now as a save with its stats; the ms it was made at, or null if the session was wiped or closed meanwhile (not the paint to keep). Throws if it can't be made. */
  private async put(s: Session) {
    const wipes = s.wipes;
    const bytes = await s.paintFile();
    if (!bytes) throw new Error('no memory for a paint file');
    const stats = s.stats.toJSON(s.joinedAt());
    return this.line(`paint save of ${s.code}`, async () => {
      if (s.wipes !== wipes || this.lobby.sessions.get(s.code) !== s) return null;
      const at = Date.now();
      const name = `${s.code}-${at}.rhhpaint`;
      await this.disk!.write(name, bytes, stats);
      await this.disk!.tidy(s.code, this.undos.get(s.code));
      log(s.code, `paint saved: ${name}, ${mb(bytes.length)} MB`);
      return at;
    });
  }

  /** `work` as a disk task of `code`: Busy if a restore is under way, or (`alone`) any other task. */
  private async hold<T>(code: string, alone: boolean, work: () => Promise<T>) {
    const n = this.working.get(code) ?? 0;
    if (this.restoring.has(code) || (alone && n)) throw new Busy(`${code}: a restore or another disk task is under way`);
    this.working.set(code, n + 1);
    if (alone) this.restoring.add(code);
    try {
      return await work();
    } finally {
      if (this.working.get(code) === 1) this.working.delete(code);
      else this.working.set(code, this.working.get(code)! - 1);
      if (alone) this.restoring.delete(code);
    }
  }

  /**
   * The admin's restore: `session`'s paint and stats become those of a kept save (its ms). The paint before is
   * saved first (the undo, kept apart from the age rule until the next restore), the restored paint after, so a
   * restart is not back to the paint before. Its players reconnect onto it (session.ts). The ms of the undo.
   */
  async restoreFrom(session: Session, from: { save: number }) {
    const { code } = session;
    if (!this.disk) throw new Refused('restore: nothing is kept without DATA_DIR');
    if (!this.public().includes(session)) throw new Refused('restore: a public session only; a private one is never kept');
    return this.hold(code, true, async () => {
      // Read in the disk line: never a save half written or rotated away.
      const { bytes, stats } = await this.line(`read for the restore of ${code}`, async () => {
        const name = await this.disk!.find(code, from.save);
        if (!name) throw new Missing(`no save ${from.save} of ${code}`);
        return { bytes: await fs.readFile(this.file(name)), stats: await this.disk!.stats(name, Date.now()) };
      });
      await session.fits(bytes);
      const undo = await this.put(session);
      if (undo === null) throw new Refused(`${code}: wiped or closed meanwhile`);
      this.undos.set(code, undo);
      const restored = stats ?? Object.assign(new SessionStats('restored'), { restoredAt: Date.now() });
      await session.restore(bytes, restored);
      const at = Math.max(Date.now(), undo + 1);
      await this.line(`restored paint of ${code}`, async () => {
        await this.disk!.write(`${code}-${at}.rhhpaint`, bytes, restored.toJSON(session.joinedAt()));
        await this.disk!.tidy(code, undo);
      });
      log(code, `paint restored from the save of ${new Date(from.save).toISOString()}; undo ${undo}`);
      event('restored', session, null, { from: 'save', save: from.save, undo });
      return undo;
    });
  }

  private public() {
    return [...this.lobby.sessions.values()].filter((s) => s.setup.admin && s.setup.kind === 'public');
  }

  /** `task` after the earlier ones; a failure is logged and thrown to who asked. */
  private line<T>(what: string, task: () => Promise<T>) {
    const done = this.chain.then(task);
    this.chain = done.catch((e) => log('-----', `${what} failed:`, e));
    return done;
  }

  /** `line`, but whether it went through. */
  private serial(what: string, task: () => Promise<unknown>) {
    return this.line(what, task).then(() => true, () => false);
  }

  /** sessions.json from the live public sessions, as made now (and those not made again at start). */
  private record() {
    if (!this.dir) return;
    return this.serial('sessions.json', async () => {
      const list: Entry[] = this.public().map(({ code, setup: { kind, name, limit, tools }, levelName, detail, table, level }) => ({ code, kind, name, limit, tools, level: levelName, detail, protocol: PROTOCOL, table, levelHash: hash(level) }));
      await fs.writeFile(this.file('sessions.json.tmp'), JSON.stringify([...list, ...this.unmade], null, 1));
      await fs.rename(this.file('sessions.json.tmp'), this.file('sessions.json'));
    });
  }

  /** A session's saves on disk, the wiped ones too, newest first, for the admin page (saves.ts info). */
  async savesOf(code: string) {
    return this.disk ? this.disk.info(code) : [];
  }

  /** The path of the save made at `ms` (wiped or not), or null. */
  async saveFile(code: string, ms: number) {
    const name = await this.disk?.find(code, ms);
    return name ? this.file(name) : null;
  }

  /** Every file of a session's, saves and what a crash left of one. */
  private async forget(code: string) {
    await this.disk?.forget(code);
  }

  private file(name: string) {
    return path.join(this.dir!, name);
  }
}
