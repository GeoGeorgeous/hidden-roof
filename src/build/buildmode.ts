import * as THREE from 'three';
import { KIT_BY_TYPE } from '../kit';
import { H_MODULE, V_MODULE } from '../kit/def';
import type { V3 } from '../kit/pieces';
import type { Input } from '../input';
import { shared } from '../materials';
import type { Level, LevelData, PropData } from '../level/level';
import type { PickupData, Pickups } from '../pickups/pickups';
import type { Player } from '../player';
import { Ghost } from './ghost';
import { SpawnMarker } from './spawn-marker';
import { BUILD, PLAYER } from '../config';
import { describeHeight, levelOf, levelY } from '../level/levels';
import { extentOf } from './extent';
import { floorBelow } from './floor';
import { CursorGrid } from './grid';
import { History, type HistoryEntry } from './history';
import { downloadLevel, pickLevelFile } from './io';
import { Picker } from './picker';
import { axisNormal, place, type Hit, type PlaceSpec } from './placement';
import { MAX_TEXT } from '../render/ink/words';

// Minecraft-style editor. Aim with the crosshair: the ghost sits on the face
// under it, snapped to the grid (on a top face it goes on top, on a side face
// next to it). LMB place (hold to keep placing), RMB delete, R rotate, MMB
// pick, Ctrl+Z undo, Tab/1-7 category, wheel prop. Aiming at empty space hits
// the build plane: the floor of the working level (PgUp / PgDn, and it follows
// what you place). P save, O load, H shows which surfaces can be painted.
// [ and ] change the aimed prop's own setting (floodlight tilt). T puts the
// spawn point on the floor under the crosshair, facing where you look; the
// spawn marker shows it while building. Enter types a sign's text (the sign
// under the crosshair, else the next ones placed); new signs reuse the last
// text typed or picked.

const HELP = 'LMB PLACE (HOLD: REPEAT) · RMB DELETE · R ROTATE · MMB PICK · CTRL+Z UNDO · TAB / 1-7 CATEGORY · WHEEL PROP · PGUP / PGDN LEVEL · T SPAWN · ENTER SIGN TEXT · [ ] TILT LIGHT · H PAINTABLE · P SAVE · O LOAD · B EXIT';
const PICKUP_SPEC: PlaceSpec = { place: 'floor', snap: 0.5 };

export class BuildMode {
  active = false;
  /** Main provides these, so saving and loading include what the level file holds besides props (pickups, city overrides). */
  getLevelData!: () => LevelData;
  /** A level file was opened (O): its data and name. */
  onLoad: (data: LevelData, name: string) => void = () => {};

  private rot = 0;
  private picker = new Picker();
  private ghost: Ghost;
  private spawnMarker: SpawnMarker;
  private grid: CursorGrid;
  private history = new History();
  private raycaster = new THREE.Raycaster();
  /** Help readout (top right): built once, then only its changing lines are rewritten. */
  private hud: HTMLElement;
  private aimText = new Text();
  private planeText = new Text();
  private statusEl: HTMLElement;
  private status = '';
  private statusTime = 0;
  private valid = false;
  private placement: { pos: V3; rot: number } | null = null;
  /** Level whose floor is the build plane (where aiming at empty space lands). */
  private workLevel = 0;
  /** Text for the next signs placed, per prop type (last typed or picked). */
  private texts = new Map<string, string>();
  /** Holding LMB: time of the next repeat placement (ms), or 0 when not holding. */
  private nextRepeat = 0;

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private pickups: Pickups,
    private player: Player,
  ) {
    this.ghost = new Ghost(scene);
    this.grid = new CursorGrid(scene);
    this.spawnMarker = new SpawnMarker(scene, PLAYER.height, PLAYER.radius);
    this.hud = div('build-help');
    const levels = div('levels');
    levels.append(this.aimText, document.createElement('br'), this.planeText);
    this.statusEl = div('status');
    this.statusEl.hidden = true;
    this.hud.append(div('title', 'BUILD'), levels, div('', HELP), this.statusEl);
    document.body.appendChild(this.hud);
    this.setActive(false);
  }

  setActive(on: boolean) {
    this.active = on;
    this.player.fly = on;
    this.picker.visible = on;
    this.hud.hidden = !on;
    this.ghost.visible = on;
    this.grid.visible = on;
    this.spawnMarker.visible = on;
    if (on) this.spawnMarker.set(this.level.spawn.pos, this.level.spawn.yaw);
    this.pickups.setEditing(on);
    if (!on) shared.uShowPaintable.value = 0;
    if (!on) this.player.unstick();
  }

  update(input: Input, camera: THREE.Camera) {
    this.pickerInput(input);
    const target = this.aim(camera);
    this.preview(target, camera.position);

    if (input.wasPressed('KeyR')) this.rot = (this.rot + 1) % 4;
    const lv = (input.wasTyped('PageUp') ? 1 : 0) - (input.wasTyped('PageDown') ? 1 : 0);
    if (lv) this.workLevel += lv;
    this.placeInput(input);
    if (input.clicked(2) && target) this.remove(target.object);
    if (input.clicked(1) && target) this.pickFrom(target.object);
    if (input.wasPressed('Ctrl+KeyZ')) {
      if (!this.history.undo((e) => this.revert(e))) this.say('NOTHING TO UNDO');
    }
    if (input.wasPressed('KeyH')) {
      shared.uShowPaintable.value = shared.uShowPaintable.value ? 0 : 1;
      this.say(shared.uShowPaintable.value ? 'PAINTABLE SURFACES: STRIPED' : 'PAINTABLE OVERLAY OFF');
    }
    if (input.wasPressed('KeyT')) this.setSpawn(target);
    const adj = (input.wasTyped('BracketRight') ? 1 : 0) - (input.wasTyped('BracketLeft') ? 1 : 0);
    if (adj && target?.object) this.adjust(target.object, adj);
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) this.editText(target?.object ?? null);
    if (input.wasPressed('KeyP')) {
      downloadLevel(this.getLevelData());
      this.say('SAVED LEVEL.JSON');
    }
    if (input.wasPressed('KeyO')) {
      pickLevelFile()
        .then(({ data, name }) => {
          this.history.clear();
          this.onLoad(data, name);
          this.spawnMarker.set(this.level.spawn.pos, this.level.spawn.yaw);
          this.say('LOADED — CLICK TO RESUME');
        })
        .catch((e) => this.say(`LOAD FAILED: ${e.message ?? e}`));
    }

    this.picker.render();
    if (this.status && performance.now() - this.statusTime > 2500) this.status = '';
    this.renderHud();
  }

  /** Rewrite only the readout lines that changed (plain text, never parsed as HTML). */
  private renderHud() {
    const at = this.placement ? describeHeight(this.placement.pos[1]) : '—';
    setText(this.aimText, `AIM ${at}`);
    setText(this.planeText, `PLANE LEVEL ${this.workLevel}`);
    if (this.statusEl.textContent !== this.status) {
      this.statusEl.textContent = this.status;
      this.statusEl.hidden = !this.status;
    }
  }

  /** LMB places; holding it keeps placing wherever the ghost moves (pillars, bridges). */
  private placeInput(input: Input) {
    const now = performance.now();
    if (input.clicked(0)) {
      this.placeCurrent(false);
      this.nextRepeat = now + BUILD.repeatDelay * 1000;
    } else if (!input.lmb) this.nextRepeat = 0;
    else if (this.nextRepeat && now >= this.nextRepeat) {
      this.placeCurrent(true);
      this.nextRepeat = now + BUILD.repeatInterval * 1000;
    }
  }

  /** [ / ] on a prop with a per-instance setting (floodlight tilt). */
  private adjust(object: THREE.Object3D, dir: number) {
    const id = this.level.idOf(object);
    const inst = id === undefined ? undefined : this.level.props.get(id);
    const a = inst && KIT_BY_TYPE.get(inst.type)?.adjust;
    if (!inst || !a) return;
    const v = this.level.setAdjust(inst.id, (inst.adjust ?? a.initial()) + dir * a.step);
    if (v !== null) this.say(`${a.label} ${v}°`);
  }

  /** Type a text for the sign under the crosshair, or for the next signs of the selected type. */
  private editText(object: THREE.Object3D | null) {
    const id = object ? this.level.idOf(object) : undefined;
    const inst = id === undefined ? undefined : this.level.props.get(id);
    const def = inst ? KIT_BY_TYPE.get(inst.type) : undefined;
    const e = this.picker.entry;
    const type = def?.text !== undefined ? def.type : e.kind === 'prop' && e.def.text !== undefined ? e.def.type : null;
    if (!type) return this.say('AIM AT A SIGN WITH TEXT');
    const current = (def?.text !== undefined ? inst!.text : undefined) ?? this.texts.get(type) ?? KIT_BY_TYPE.get(type)!.text!;
    const typed = window.prompt('Sign text (empty = default)', current);
    if (typed === null) return;
    const text = typed.trim().slice(0, MAX_TEXT);
    if (text) this.texts.set(type, text);
    else this.texts.delete(type);
    if (def?.text !== undefined) this.level.setText(inst!.id, text);
    this.say(`TEXT: ${text || 'DEFAULT'} — CLICK TO RESUME`);
  }

  /** Spawn on the floor under the crosshair (or below you), facing your view direction. */
  private setSpawn(target: Hit | null) {
    const at = target && target.normal.y > 0.5 ? target.point : this.player.position;
    const floor = this.floorAt(at.x, at.y + 0.05, at.z);
    if (floor === null) {
      this.say('NO FLOOR THERE');
      return;
    }
    const pos: V3 = [+at.x.toFixed(2), floor, +at.z.toFixed(2)];
    const yaw = +this.player.yaw.toFixed(3);
    this.level.spawn = { pos, yaw };
    this.player.setSpawnPoint(new THREE.Vector3(...pos), yaw);
    this.spawnMarker.set(pos, yaw);
    this.say('SPAWN SET');
  }

  private pickerInput(input: Input) {
    if (input.wasPressed('Tab')) this.picker.nextCategory(input.isDown('ShiftLeft') ? -1 : 1);
    for (let i = 0; i < this.picker.categories.length; i++) if (input.wasPressed(`Digit${i + 1}`)) this.picker.setCategory(i);
    if (input.wheelSteps) this.picker.wheel(Math.sign(input.wheelSteps));
  }

  /** Raycast from the screen center; falls back to the build plane (the working level's floor), from above or below. */
  private aim(camera: THREE.Camera): (Hit & { object: THREE.Object3D | null }) | null {
    camera.getWorldDirection(this.raycaster.ray.direction);
    this.raycaster.ray.origin.copy(camera.position);
    this.raycaster.far = BUILD.reach;
    const hit = this.raycaster.intersectObjects([this.level.root, this.pickups.root], true)[0];
    if (hit) return { point: hit.point.clone(), normal: axisNormal(hit.face?.normal ?? new THREE.Vector3(0, 1, 0)), object: hit.object };
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) < 0.01) return null;
    const t = (levelY(this.workLevel) - ray.origin.y) / ray.direction.y;
    if (t <= 0 || t > BUILD.reach) return null;
    return { point: ray.at(t, new THREE.Vector3()), normal: new THREE.Vector3(0, 1, 0), plane: true, object: null };
  }

  private floorAt = (x: number, y: number, z: number) => {
    const h = floorBelow(this.level.root, x, y, z);
    const plane = levelY(this.workLevel);
    return h ?? (y + 0.1 >= plane ? plane : null);
  };

  private preview(target: Hit | null, eye: THREE.Vector3) {
    if (!target) {
      this.ghost.visible = false;
      this.grid.visible = false;
      this.placement = null;
      return;
    }
    const e = this.picker.entry;
    const spec: PlaceSpec = e.kind === 'prop' ? e.def : PICKUP_SPEC;
    const pl = place(spec, target, this.rot, this.floorAt, e.kind === 'prop' ? extentOf(e.def, this.rot) : undefined);
    if (e.kind === 'prop') this.ghost.showProp(e.def, pl.pos, pl.rot, this.level.stackContext(e.def.type, pl.pos, pl.rot), this.texts.get(e.def.type));
    else this.ghost.showPickup(pl.pos);
    // Like Minecraft, never place into yourself (a held LMB pillar stops at your eyes).
    this.valid = pl.ok && !this.level.overlaps(this.ghost.colliders) && !this.ghost.colliders.some((c) => c.containsPoint(eye));
    this.ghost.setValid(this.valid);
    this.ghost.visible = true;
    this.placement = { pos: pl.pos, rot: pl.rot };
    const module = spec.snap >= H_MODULE;
    this.grid.visible = true;
    this.grid.update(target.point, target.normal, module ? H_MODULE : spec.snap, module ? V_MODULE : spec.snap);
  }

  /** Repeats (LMB held) skip quietly when the ghost is blocked, e.g. still on the block just placed. */
  private placeCurrent(repeat: boolean) {
    if (!this.placement) return;
    if (!this.valid) return repeat ? undefined : this.say('BLOCKED');
    const e = this.picker.entry;
    const { pos, rot } = this.placement;
    if (e.kind === 'prop') {
      const inst = this.level.add({ type: e.def.type, pos, rot, text: this.texts.get(e.def.type) });
      if (inst) this.history.push({ op: 'add', kind: 'prop', id: inst.id, data: null });
    } else {
      const p = this.pickups.add(e.type, pos);
      if (p) this.history.push({ op: 'add', kind: 'pickup', id: p.id, data: null });
    }
    // Keep building on the level you just built on when aiming into empty space.
    this.workLevel = levelOf(pos[1]);
    this.valid = false; // re-checked next frame against the new prop
  }

  private remove(o: THREE.Object3D | null) {
    if (!o) return;
    const pid = this.pickups.idOf(o);
    const pk = pid !== undefined ? this.pickups.list.get(pid) : undefined;
    if (pk) {
      this.history.push({ op: 'remove', kind: 'pickup', id: pk.id, data: { kind: pk.kind, pos: pk.pos } satisfies PickupData });
      this.pickups.remove(pk.id);
      return;
    }
    const id = this.level.idOf(o);
    const inst = id !== undefined ? this.level.props.get(id) : undefined;
    // The player's stepladder isn't part of the level: never deleted (or restored by undo) as a prop.
    if (!inst || inst.runtime) return;
    this.history.push({ op: 'remove', kind: 'prop', id: inst.id, data: { id: inst.id, type: inst.type, pos: inst.pos, rot: inst.rot, adjust: inst.adjust, text: inst.text } satisfies PropData });
    this.level.remove(inst.id);
  }

  private pickFrom(o: THREE.Object3D | null) {
    if (!o) return;
    const pid = this.pickups.idOf(o);
    if (pid !== undefined) {
      this.picker.pick('pickup', this.pickups.list.get(pid)!.kind);
      return this.say(`PICKED ${this.picker.entry.label.toUpperCase()}`);
    }
    const id = this.level.idOf(o);
    const inst = id !== undefined ? this.level.props.get(id) : undefined;
    if (inst && !inst.runtime && KIT_BY_TYPE.has(inst.type)) {
      this.picker.pick('prop', inst.type);
      this.rot = inst.rot;
      if (inst.text !== undefined) this.texts.set(inst.type, inst.text);
      else this.texts.delete(inst.type);
      this.say(`PICKED ${this.picker.entry.label.toUpperCase()}`);
    }
  }

  private revert(e: HistoryEntry): number | undefined {
    if (e.op === 'add') {
      if (e.kind === 'prop') this.level.remove(e.id);
      else this.pickups.remove(e.id);
      return undefined;
    }
    if (e.kind === 'prop') return this.level.add(e.data as PropData)?.id;
    const d = e.data as PickupData;
    return this.pickups.add(d.kind, d.pos)?.id;
  }

  private say(m: string) {
    this.status = m;
    this.statusTime = performance.now();
  }
}

function div(className: string, text = '') {
  return Object.assign(document.createElement('div'), { className, textContent: text });
}

function setText(node: Text, s: string) {
  if (node.data !== s) node.data = s;
}
