import type * as THREE from 'three';
import type { Level } from '../level/level';
import type { PaintOps } from '../paint-ops';
import type { Tools } from '../tools/tools';
import type { NetLog } from './diagnostics';
import { Nameplates, type Plate } from './nameplates';
import type { SurfaceIndex } from '../op-wire';
import type { Presence, ToClient } from './protocol';
import { RemotePlayer } from './remote-player';

// The other players in a session, by id: their figures (remote-player.ts),
// name tags (nameplates.ts) noting what they're doing (away, in the menu,
// idle, gone; far behind only when nothing else: the others say more), and their
// stepladders. The network log hears when each comes, is first shown, and goes.

/** A player's key: what they own (their stepladder). */
export const ownerOf = (id: number) => `player${id}`;

export class Remotes {
  readonly names = new Map<number, string>();
  private list = new Map<number, RemotePlayer>();
  private nameplates = new Nameplates();
  /** The nameplates' players, refilled each frame. */
  private plates: Plate[] = [];
  /** Players not shown yet, and since when (s), for the log. */
  private unseen = new Map<number, number>();

  constructor(
    private g: { scene: THREE.Scene; camera: THREE.Camera; level: Level; paintOps: PaintOps; tools: Tools },
    private log: NetLog,
  ) {}

  get(id: number) {
    return this.list.get(id);
  }

  /** Every one of them, by id (read-only: for tests and tools). */
  get players(): ReadonlyMap<number, RemotePlayer> {
    return this.list;
  }

  /** Where the others shown stand. */
  get shown() {
    return [...this.list.values()].filter((r) => r.avatar.group.visible).map((r) => r.position);
  }

  add(id: number, name: string, presence: Presence, now: number) {
    this.remove(id);
    const r = new RemotePlayer(this.g.scene, this.g.level, this.g.paintOps, ownerOf(id), this.g.tools.spray.others);
    r.presence = presence;
    this.names.set(id, name);
    this.list.set(id, r);
    this.unseen.set(id, now);
    this.log.add(`#${id} "${name}" is in the session${presence === 'here' ? '' : ` (${presence})`}`);
  }

  /** `finish`: their paint ops still waiting for their figure are painted first (they left: it won't get there). */
  remove(id: number, finish = false) {
    const r = this.list.get(id);
    if (!r) return;
    if (finish) r.finish();
    r.dispose();
    this.log.add(`#${id} "${this.names.get(id)}" taken away`);
    this.list.delete(id);
    this.names.delete(id);
    this.unseen.delete(id);
  }

  clear() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }

  /** The session's players and their stepladders, as its welcome has them, in place of any before. */
  fill(w: Extract<ToClient, { type: 'welcome' }>, now: number) {
    this.clear();
    for (const p of w.players) this.add(p.id, p.name, p.state, now);
    for (const l of w.ladders) this.g.level.setRuntime(ownerOf(l.id), l.data);
  }

  presence(id: number, state: Presence) {
    const r = this.list.get(id);
    if (!r || r.presence === state) return;
    r.presence = state;
    this.log.add(`#${id} "${this.names.get(id)}" ${state}`);
  }

  /** A message about the other players (their state, paint, stepladders, coming, going): done with it, true; any other, false. `arrived`: when it came (local s); `onPlayer`: someone joined or left. */
  handle(m: ToClient, surfaces: SurfaceIndex, arrived: number, onPlayer: (name: string, joined: boolean) => void) {
    if (m.type === 'state' || m.type === 'ops' || m.type === 'ladder') this.get(m.id)?.deliver(m, surfaces, arrived);
    else if (m.type === 'joined') {
      this.add(m.id, m.name, 'here', arrived);
      onPlayer(m.name, true);
    } else if (m.type === 'presence') this.presence(m.id, m.state);
    else if (m.type === 'left') {
      const name = this.names.get(m.id);
      this.remove(m.id, true);
      if (name !== undefined) onPlayer(name, false);
    } else return false;
    return true;
  }

  /** Once a frame, at local time `now` (s). */
  update(camera: THREE.Camera, now: number, dt: number) {
    let shown = 0;
    for (const [id, r] of this.list) {
      r.update(now, dt);
      if (!r.avatar.group.visible) continue;
      const plate = (this.plates[shown++] ??= { id, name: '', note: null, feet: r.position });
      plate.id = id;
      plate.name = this.names.get(id) ?? '';
      plate.note = r.look !== 'here' ? r.look : null;
      plate.feet = r.position;
      const since = this.unseen.get(id);
      if (since === undefined) continue;
      this.log.add(`#${id} "${this.names.get(id)}" shown after ${(now - since).toFixed(1)} s`);
      this.unseen.delete(id);
    }
    this.plates.length = shown;
    this.nameplates.update(camera, this.plates);
  }

  /** Who's in the session besides us, and their paint colors (the pause screen's live line). */
  get roster() {
    return [...this.list].map(([id, r]) => ({ name: this.names.get(id) ?? '', color: r.color }));
  }

  /** For the HUD: how far behind each is shown, and the jitter of their snapshots. */
  get stats() {
    return [...this.list].map(([id, r]) => ({ name: this.names.get(id) ?? '', delay: r.stats.delay, jitter: r.stats.jitter }));
  }
}
