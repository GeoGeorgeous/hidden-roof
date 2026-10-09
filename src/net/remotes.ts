import type * as THREE from 'three';
import type { Level } from '../level/level';
import type { PaintOps } from '../paint-ops';
import type { Tools } from '../tools/tools';
import type { NetLog } from './diagnostics';
import { Nameplates } from './nameplates';
import type { Presence } from './protocol';
import { RemotePlayer, type Look } from './remote-player';

// The other players in a session, by id: their figures (remote-player.ts),
// name tags (nameplates.ts) saying when they're away or gone, and their
// stepladders. The network log hears when each comes, is first shown, and goes.

/** A player's key: what they own (their stepladder). */
export const ownerOf = (id: number) => `player${id}`;

const NOTE: Record<Look, string> = { here: '', away: 'AWAY', dropped: 'DISCONNECTED', silent: 'NO SIGNAL' };

export class Remotes {
  readonly names = new Map<number, string>();
  private list = new Map<number, RemotePlayer>();
  private nameplates = new Nameplates();
  /** Players not shown yet, and since when (s), for the log. */
  private unseen = new Map<number, number>();

  constructor(
    private g: { scene: THREE.Scene; camera: THREE.Camera; level: Level; paintOps: PaintOps; tools: Tools },
    private log: NetLog,
  ) {}

  get(id: number) {
    return this.list.get(id);
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

  presence(id: number, state: Presence) {
    const r = this.list.get(id);
    if (!r || r.presence === state) return;
    r.presence = state;
    this.log.add(`#${id} "${this.names.get(id)}" ${state}`);
  }

  /** Once a frame, at local time `now` (s). */
  update(camera: THREE.Camera, now: number, dt: number) {
    for (const [id, r] of this.list) {
      r.update(now, dt);
      const since = this.unseen.get(id);
      if (since === undefined || !r.avatar.group.visible) continue;
      this.log.add(`#${id} "${this.names.get(id)}" shown after ${(now - since).toFixed(1)} s`);
      this.unseen.delete(id);
    }
    const shown = [...this.list].filter(([, r]) => r.avatar.group.visible);
    this.nameplates.update(camera, shown.map(([id, r]) => ({ id, name: this.names.get(id) ?? '', note: NOTE[r.look], feet: r.position })));
  }

  /** For the HUD: how far behind each is shown, and the jitter of their snapshots. */
  get stats() {
    return [...this.list].map(([id, r]) => ({ name: this.names.get(id) ?? '', delay: r.stats.delay, jitter: r.stats.jitter }));
  }
}
