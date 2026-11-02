import * as THREE from 'three';
import { PaintedSpots } from '../build/painted-spots';
import { ADMIN } from '../config';
import { keyName } from '../input';
import type { Inventory } from '../inventory/inventory';
import type { Level } from '../level/level';
import { solidsNear } from '../level/solids';
import { msg, type MessageId } from '../messages';
import type { AdminSession } from '../net/watching';
import type { Notify } from '../notify';
import type { PaintSystem } from '../painting';
import type { PauseMenu } from '../pause-menu';
import type { Player } from '../player';
import { facePoint } from '../surfaces';
import { playersPage } from './players-page';

// Admin mode in a session (server/admins.ts), loaded only when a welcome says admin: unseen at first (tools off),
// flying, with every color and cap and the tools the session allows (its pickups stay). Its keys, on the panel at
// the top left: seen or not (H), fly (J), lock or unlock the face pointed at (L), the locked faces' outlines (O),
// and the players page (G), which puts the admin where this game last showed one. The server grants and checks
// every power: this only asks.

/** What admin mode works with. */
export interface AdminGame {
  scene: THREE.Scene;
  camera: THREE.Camera;
  level: Level;
  paint: PaintSystem;
  player: Player;
  inventory: Inventory;
  notify: Notify;
  menu: PauseMenu;
  /** Paused behind the menu: the keys work in play only. */
  paused(): boolean;
}

const KEYS: [keyof typeof ADMIN.keys, MessageId][] = [
  ['seen', 'admin.keySeen'],
  ['fly', 'admin.keyFly'],
  ['lock', 'admin.keyLock'],
  ['outlines', 'admin.keyOutlines'],
  ['list', 'admin.keyList'],
];

export class AdminMode {
  private seen = false;
  /** The locked faces' outlines, while O shows them. */
  private outlines: PaintedSpots | null = null;
  private panel = document.createElement('div');
  private state = document.createElement('span');
  private ray = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];

  constructor(
    private a: AdminSession,
    private g: AdminGame,
  ) {
    // Every color and cap, the session's tools found: held only while seen.
    g.inventory.allowOnly(a.tools);
    g.inventory.unlockAll();
    g.inventory.allowOnly([]);
    g.player.fly = true;
    a.onLocks = () => this.outlines && this.drawOutlines();
    playersPage(g.menu, { players: a.players, go: (at) => g.player.place(at.toArray(), g.player.yaw) });
    this.panel.className = 'admin-panel';
    const head = document.createElement('div');
    head.append(msg('admin.panelTitle'), ' · ', this.state);
    this.panel.append(head, ...KEYS.map(([k, text]) => Object.assign(document.createElement('div'), { textContent: `${keyName(ADMIN.keys[k])}  ${msg(text)}` })));
    document.querySelector('.layer-world')!.append(this.panel);
    this.sync();
    addEventListener('keydown', this.key);
  }

  dispose() {
    removeEventListener('keydown', this.key);
    this.panel.remove();
    this.outlines?.dispose();
    this.outlines = null;
    this.a.onLocks = () => {};
    playersPage(this.g.menu, null);
    this.g.player.fly = false;
  }

  /** The keys work in play only. */
  private key = (e: KeyboardEvent) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || this.g.paused()) return;
    const k = ADMIN.keys;
    if (e.code === k.seen) this.see(!this.seen);
    else if (e.code === k.fly) this.fly();
    else if (e.code === k.lock) this.lock();
    else if (e.code === k.outlines) this.showOutlines(!this.outlines);
    else if (e.code === k.list) (this.g.menu.openPage('admin'), document.exitPointerLock());
  };

  private see(on: boolean) {
    this.seen = on;
    this.a.send({ type: 'seen', on });
    this.g.inventory.allowOnly(on ? this.a.tools : []);
    this.say(on ? 'admin.nowSeen' : 'admin.nowUnseen');
    this.sync();
  }

  private fly() {
    const p = this.g.player;
    p.fly = !p.fly;
    if (!p.fly) p.unstick();
    this.say(p.fly ? 'admin.flyOn' : 'admin.flyOff');
  }

  /** The face under the crosshair, locked if it wasn't, unlocked if it was: the server's answer locks it here too. */
  private lock() {
    const { camera, level, paint } = this.g;
    camera.getWorldPosition(this.ray.ray.origin);
    camera.getWorldDirection(this.ray.ray.direction);
    this.ray.far = ADMIN.reach;
    const hit = this.ray.intersectObjects(solidsNear(level.solids, this.ray.ray.origin, ADMIN.reach, this.near), false)[0];
    const s = hit && paint.get(hit.object);
    const surface = s && this.a.surfaces.indexOf(s.key);
    if (!s || surface === undefined) return this.say('admin.noFace');
    const { rect } = facePoint(s.geo, hit.faceIndex!, hit.uv!, { rect: 0, u: 0, v: 0 });
    const on = !paint.locks.has(s.key, rect);
    this.a.send({ type: 'lock', surface, rect, on });
    this.say(on ? 'admin.locked' : 'admin.unlocked');
  }

  private showOutlines(on: boolean) {
    this.outlines?.dispose();
    this.outlines = null;
    if (!on) return this.say('admin.outlinesOff');
    this.outlines = new PaintedSpots(this.g.scene);
    this.outlines.syncLook(ADMIN.outlineColor, ADMIN.outlineOpacity);
    this.drawOutlines();
    this.g.notify.toast(msg('admin.outlinesOn', { n: this.outlines.count }));
  }

  private drawOutlines() {
    const paint = this.g.paint;
    this.outlines!.frame(
      paint.locks.list().flatMap(([key, rect]) => {
        const s = paint.find(key);
        const r = s?.geo.rects[rect];
        return s && r ? [{ s, r }] : [];
      }),
    );
  }

  private sync() {
    this.state.textContent = msg(this.seen ? 'admin.panelSeen' : 'admin.panelUnseen');
    this.panel.classList.toggle('seen', this.seen);
  }

  private say(id: MessageId) {
    this.g.notify.toast(msg(id));
  }
}
