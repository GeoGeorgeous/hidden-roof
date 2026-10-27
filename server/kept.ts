import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { levelProblem, type LevelData } from '../src/level/level-data';
import { CODE_LENGTH, CODE_LETTERS, isSessionName, isToolSet, PROTOCOL, type SessionKind } from '../src/net/protocol';
import { event } from './events';
import { log, mb } from './log';
import type { Lobby } from './lobby';
import { isWiped, leftover, Saves, savedAt } from './saves';
import type { Session } from './session';
import type { SessionSetup } from './setup';

// The admin's sessions (admin-api.ts), and the public ones kept on disk in
// `dir` (DATA_DIR): sessions.json lists them with what they were made for (the
// protocol, the surface table, the level). Each one's paint is saved every
// SERVER.keepEvery when it changed, and at shutdown, as <code>-<ms>.rhhpaint
// with its stats beside it (saves.ts); the newest SERVER.keepFiles stay. At start each is made again under its code,
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

/** A request the admin got wrong (admin-api.ts answers 400); any other error is the server's. */
export class Refused extends Error {}

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
    session.wipe();
    log(session.code, 'wiped by the admin');
    event('wiped', session);
    if (this.disk) await this.serial(`wipe of ${session.code}`, () => this.disk!.aside(session.code));
  }

  /** The admin closed it: gone, from disk too. */
  async end(session: Session) {
    session.end();
    await this.serial(`close of ${session.code}`, () => this.forget(session.code));
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
    for (const s of this.public()) if (s.changed) await this.saveOne(s);
  }

  /** `s`'s paint as a new save. `changed` goes down before the paint is read and comes back if no save was made: the next one tries again. */
  private async saveOne(s: Session) {
    const wipes = s.wipes;
    s.changed = false;
    let name = '';
    let size = 0;
    try {
      const bytes = await s.paintFile();
      if (!bytes) throw new Error('no memory for a paint file');
      size = bytes.length;
      const stats = s.stats.toJSON(s.joinedAt());
      const ok = await this.serial(`paint save of ${s.code}`, async () => {
        // Wiped or closed meanwhile: not the paint to keep.
        if (s.wipes !== wipes || this.lobby.sessions.get(s.code) !== s) return;
        name = `${s.code}-${Date.now()}.rhhpaint`;
        await this.disk!.write(name, bytes, stats);
        for (const old of (await this.disk!.list(s.code)).filter((n) => !isWiped(n)).slice(SERVER.keepFiles)) await this.disk!.remove(old);
      });
      if (!ok) throw new Error('disk');
    } catch (e) {
      s.changed = true;
      log(s.code, 'paint not saved:', e);
      event('save-failed', s, null, { why: (e as Error).message });
    }
    if (name) log(s.code, `paint saved: ${name}, ${mb(size)} MB`);
  }

  private public() {
    return [...this.lobby.sessions.values()].filter((s) => s.setup.admin && s.setup.kind === 'public');
  }

  /** `task` after the earlier ones; a failure is logged. Whether it went through. */
  private serial(what: string, task: () => Promise<void>) {
    const done = this.chain.then(task).then(
      () => true,
      (e) => (log('-----', `${what} failed:`, e), false),
    );
    this.chain = done;
    return done;
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

  /** A session's saves on disk, the wiped ones too, newest first: when (ISO), how big and whether wiped, for the admin page. One rotated away meanwhile is left out. */
  async savesOf(code: string) {
    if (!this.disk) return [];
    const list = await Promise.all((await this.disk.list(code)).map((n) => fs.stat(this.file(n)).then(({ size }) => ({ at: new Date(savedAt(code, n)).toISOString(), bytes: size, wiped: isWiped(n) }), () => null)));
    return list.filter((s) => s !== null);
  }

  /** Every file of a session's, saves and what a crash left of one. */
  private async forget(code: string) {
    await this.disk?.forget(code);
  }

  private file(name: string) {
    return path.join(this.dir!, name);
  }
}
