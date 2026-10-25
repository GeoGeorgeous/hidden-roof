import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { levelProblem, type LevelData } from '../src/level/level-data';
import { PROTOCOL, type SessionKind } from '../src/net/protocol';
import { event } from './events';
import { log, mb } from './log';
import type { Lobby } from './lobby';
import type { Session, SessionSetup } from './session';

// The admin's sessions (admin-api.ts), and the public ones kept on disk in
// `dir` (DATA_DIR): sessions.json lists them with what they were made for (the
// protocol, the surface table, the level). Each one's paint is saved every
// SERVER.keepEvery when it changed, and at shutdown, as <code>-<ms>.rhhpaint;
// the newest SERVER.keepFiles stay. At start each is made again under its code,
// from its newest save that loads. The admin's wipe keeps the newest
// SERVER.keepFiles saves aside, as <code>-<ms>.wiped.rhhpaint: never loaded,
// never rotated away by new saves. A new protocol, surface table or level wipes
// it for good, and so does a close: a release that changes none of them keeps the paint.

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

/** When a save was made (ms), from its name, <code>-<ms>.rhhpaint or <code>-<ms>.wiped.rhhpaint. */
const savedAt = (code: string, name: string) => parseInt(name.slice(code.length + 1));
const wiped = (name: string) => name.endsWith('.wiped.rhhpaint');
const hash = (level: LevelData) => createHash('sha256').update(JSON.stringify(level)).digest('hex').slice(0, 16);

export class Kept {
  private saving = false;

  /** `levels`: where the level files are (LEVELS_DIR); `dir`: null keeps nothing on disk. */
  constructor(
    private lobby: Lobby,
    private levels: string,
    readonly dir: string | null,
  ) {}

  /** levels/<name>.json, checked as a hosted level is. Throws with a message if there's none or it's no good. */
  async level(name: string): Promise<LevelData> {
    if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error(`no level ${JSON.stringify(name)}`);
    const data: unknown = JSON.parse(await fs.readFile(path.join(this.levels, `${name}.json`), 'utf8').catch(() => 'null'));
    if (data === null) throw new Error(`no level ${JSON.stringify(name)}`);
    const problem = levelProblem(data);
    if (problem) throw new Error(`level ${name}: ${problem}`);
    return data as LevelData;
  }

  /** A new session of the admin's; a public one is kept. */
  async create(setup: Omit<SessionSetup, 'admin'>, levelName: string, detail: number) {
    const session = this.lobby.create(setup, levelName, await this.level(levelName), detail);
    event('session-made', session, null, { kind: setup.kind, limit: setup.limit, stays: setup.stays });
    await this.record();
    return session;
  }

  /** The admin's wipe: no paint in the session; on disk its newest saves stay aside, wiped, and the rest go. */
  async wipe(session: Session) {
    session.wipe();
    log(session.code, 'wiped by the admin');
    event('wiped', session);
    if (!this.dir) return;
    for (const [i, name] of (await this.saves(session.code)).entries())
      if (i >= SERVER.keepFiles) await fs.rm(this.file(name), { force: true });
      else if (!wiped(name)) await fs.rename(this.file(name), this.file(name.replace('.rhhpaint', '.wiped.rhhpaint')));
  }

  /** The admin closed it: gone, from disk too. */
  async end(session: Session) {
    session.end();
    await this.forget(session.code);
    await this.record();
  }

  /** At start: every kept session again, with its paint unless what it was made for has changed. */
  async restore() {
    if (!this.dir) return;
    await fs.mkdir(this.dir, { recursive: true });
    let list: Entry[] = [];
    try {
      list = JSON.parse(await fs.readFile(this.file('sessions.json'), 'utf8').catch(() => '[]'));
    } catch (e) {
      // Kept aside for a look by hand: the paint files stay, the sessions are made again by the admin.
      log('-----', 'sessions.json unreadable, kept as sessions.json.bad:', e);
      await fs.rename(this.file('sessions.json'), this.file('sessions.json.bad'));
    }
    for (const e of list) {
      let session: Session;
      let level: LevelData;
      try {
        level = await this.level(e.level);
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
      for (const name of (await this.saves(e.code)).filter((n) => !wiped(n)))
        try {
          await session.load(await fs.readFile(this.file(name)), false);
          log(e.code, `paint from ${name}: ${session.memory.now.toFixed(0)} MB`);
          break;
        } catch (err) {
          log(e.code, `paint file ${name} refused: ${(err as Error).message}`);
        }
    }
    await this.record();
  }

  /** Every kept session's paint that changed since its last save (every SERVER.keepEvery, and at shutdown). */
  async save() {
    if (!this.dir || this.saving) return;
    this.saving = true;
    try {
      for (const s of this.public())
        if (s.changed) {
          const wipes = s.wipes;
          const bytes = await s.paintFile();
          if (!bytes) {
            log(s.code, 'paint not saved: no memory for a paint file');
            event('save-failed', s, null, { why: 'no memory for a paint file' });
            continue;
          }
          // Wiped or closed while it was read: not the paint to keep.
          if (s.wipes !== wipes || this.lobby.sessions.get(s.code) !== s) continue;
          const name = `${s.code}-${Date.now()}.rhhpaint`;
          await fs.writeFile(this.file(`${name}.tmp`), bytes);
          await fs.rename(this.file(`${name}.tmp`), this.file(name));
          for (const old of (await this.saves(s.code)).filter((n) => !wiped(n)).slice(SERVER.keepFiles)) await fs.rm(this.file(old), { force: true });
          log(s.code, `paint saved: ${name}, ${mb(bytes.length)} MB`);
        }
    } catch (e) {
      log('-----', 'paint save failed:', e);
      event('save-failed', null, null, { why: (e as Error).message });
    } finally {
      this.saving = false;
    }
  }

  private public() {
    return [...this.lobby.sessions.values()].filter((s) => s.setup.admin && s.setup.kind === 'public');
  }

  /** sessions.json from the live public sessions, as made now. */
  private async record() {
    if (!this.dir) return;
    const list: Entry[] = this.public().map(({ code, setup: { kind, name, limit, tools }, levelName, detail, table, level }) => ({ code, kind, name, limit, tools, level: levelName, detail, protocol: PROTOCOL, table, levelHash: hash(level) }));
    await fs.writeFile(this.file('sessions.json.tmp'), JSON.stringify(list, null, 1));
    await fs.rename(this.file('sessions.json.tmp'), this.file('sessions.json'));
  }

  /** A session's saves on disk, the wiped ones too, newest first: when (ISO), how big and whether wiped, for the admin page. */
  async savesOf(code: string) {
    if (!this.dir) return [];
    return Promise.all((await this.saves(code)).map(async (n) => ({ at: new Date(savedAt(code, n)).toISOString(), bytes: (await fs.stat(this.file(n))).size, wiped: wiped(n) })));
  }

  /** A session's saves, wiped ones included, newest first. */
  private async saves(code: string) {
    const names = (await fs.readdir(this.dir!)).filter((n) => n.startsWith(`${code}-`) && n.endsWith('.rhhpaint'));
    return names.sort((a, b) => savedAt(code, b) - savedAt(code, a));
  }

  private async forget(code: string) {
    if (this.dir) for (const name of await this.saves(code)) await fs.rm(this.file(name), { force: true });
  }

  private file(name: string) {
    return path.join(this.dir!, name);
  }
}
