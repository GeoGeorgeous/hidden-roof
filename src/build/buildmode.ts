import * as THREE from 'three';
import { defOf } from '../kit';
import { H_MODULE, V_MODULE, type PropDef } from '../kit/def';
import type { V3 } from '../kit/pieces';
import type { Input } from '../input';
import { shared } from '../materials';
import type { Level, LevelData, PropData } from '../level/level';
import type { PickupData, Pickups } from '../pickups/pickups';
import type { Player } from '../player';
import { Ghost, GREEN, RED } from './ghost';
import { PropSettings } from './prop-settings';
import { SpawnMarker } from './spawn-marker';
import { BUILD, PLAYER } from '../config';
import { describeHeight, levelOf, levelY } from '../level/levels';
import { extentOf } from './extent';
import { floorBelow } from './floor';
import { CursorGrid } from './grid';
import { History, type HistoryEntry } from './history';
import { downloadLevel, pickLevelFile } from './io';
import { Picker, type Choice } from './picker';
import { propAt } from '../level/stacks';
import { PickerView } from './picker-view';
import { Thumbnails } from '../inventory/thumbnails';
import { axisNormal, place, type Hit, type PlaceSpec } from './placement';

// Minecraft-style editor. Aim with the crosshair: the ghost sits on the face
// under it, snapped to the grid (on a top face it goes on top, on a side face
// next to it). LMB place (hold to keep placing), RMB delete, R rotate, MMB
// pick, Ctrl+Z undo; the wheel turns the category wheel, E / Q step through
// its props, Tab / Shift+Tab through a prop's variants. Aiming at empty space hits
// the build plane: the floor of the working level (PgUp / PgDn, and it follows
// what you place). P save, O load, H shows which surfaces can be painted.
// [ and ] and Enter change a placed prop's settings (prop-settings.ts). The spawn
// point is an entry of the picker (LEVEL): placing it moves the level's one
// spawn there, facing where you look; the spawn marker shows it while
// building.

const HELP = 'LMB PLACE (HOLD: REPEAT) · RMB DELETE · R ROTATE (ON A WALL: FLIP) · MMB PICK · CTRL+Z UNDO · WHEEL CATEGORY · Q / E PROP · TAB VARIANT · PGUP / PGDN LEVEL · F WALL: OWN / BRICK · V APPLY FINISH · ENTER SIGN TEXT · [ ] SETTING · H PAINTABLE · P SAVE · O LOAD · B EXIT';
/** What build mode works on under the crosshair: a placed prop or a pickup (by id). */
type Target = { kind: 'prop' | 'pickup'; id: number };

/** Pickups and the spawn point stand on the floor. */
const FLOOR_SPEC: PlaceSpec = { place: 'floor', snap: 0.5 };

export class BuildMode {
  active = false;
  /** Main provides these, so saving and loading include what the level file holds besides props (pickups, city overrides). */
  getLevelData!: () => LevelData;
  /** A level file was opened (O): its data and name. */
  onLoad: (data: LevelData, name: string) => void = () => {};

  private rot = 0;
  private picker = new Picker();
  private pickerView: PickerView;
  private ghost: Ghost;
  private spawnMarker: SpawnMarker;
  /** The spawn point about to be placed. */
  private spawnGhost: SpawnMarker;
  /** Outline of the target: what RMB deletes. */
  private outline: Ghost;
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
  private settings: PropSettings;
  /** Holding LMB: time of the next repeat placement (ms), or 0 when not holding. */
  private nextRepeat = 0;

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private pickups: Pickups,
    private player: Player,
    renderer: THREE.WebGLRenderer,
  ) {
    this.pickerView = new PickerView(this.picker, new Thumbnails(renderer), () => pickups.list.values());
    this.ghost = new Ghost(scene);
    this.outline = new Ghost(scene, { color: BUILD.targetColor, opacity: BUILD.targetOpacity, outline: true });
    this.settings = new PropSettings(scene, level, (m) => this.say(m), (def) => this.picker.finishFor(def));
    this.grid = new CursorGrid(scene);
    this.spawnMarker = new SpawnMarker(scene, PLAYER.height, PLAYER.radius);
    this.spawnGhost = new SpawnMarker(scene, PLAYER.height, PLAYER.radius);
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
    this.pickerView.visible = on;
    this.hud.hidden = !on;
    this.ghost.visible = on;
    if (!on) this.outline.visible = false;
    this.settings.visible = on;
    this.grid.visible = on;
    this.spawnMarker.visible = on;
    if (!on) this.spawnGhost.visible = false;
    if (on) this.spawnMarker.set(this.level.spawn.pos, this.level.spawn.yaw);
    this.pickups.setEditing(on);
    if (!on) shared.uShowPaintable.value = 0;
    if (!on) this.player.unstick();
  }

  /** The picker's size or shade, the outline's or the highlight's look changed (F3). */
  syncLook() {
    this.pickerView.syncStyle();
    this.outline.setLook(BUILD.targetColor, BUILD.targetOpacity);
    this.settings.syncLook();
  }

  update(input: Input, camera: THREE.Camera) {
    this.pickerInput(input);
    const target = this.aim(camera);
    this.preview(target, camera.position);
    // What RMB deletes, MMB picks and the settings keys change: one target, outlined.
    const aimed = this.targetOf(target);
    this.outlineTarget(aimed);

    if (input.wasPressed('KeyR')) this.rotate();
    const lv = (input.wasTyped('PageUp') ? 1 : 0) - (input.wasTyped('PageDown') ? 1 : 0);
    if (lv) this.workLevel += lv;
    this.placeInput(input);
    if (input.clicked(2) && aimed) this.remove(aimed);
    if (input.clicked(1) && aimed) this.pickFrom(aimed);
    if (input.wasPressed('Ctrl+KeyZ')) {
      if (!this.history.undo((e) => this.revert(e))) this.say('NOTHING TO UNDO');
    }
    if (input.wasPressed('KeyH')) {
      shared.uShowPaintable.value = shared.uShowPaintable.value ? 0 : 1;
      this.say(shared.uShowPaintable.value ? 'PAINTABLE SURFACES: STRIPED' : 'PAINTABLE OVERLAY OFF');
    }
    const e = this.picker.choice;
    this.settings.update(input, aimed?.kind === 'prop' ? this.level.props.get(aimed.id) : undefined, e.kind === 'prop' ? e.def : null);
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

    this.pickerView.render();
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

  /** R: a quarter turn, or for a wall piece (which faces out of its wall) a flip left to right. */
  private rotate() {
    const e = this.picker.choice;
    if (e.kind !== 'prop' || e.def.place !== 'mount') return void (this.rot = (this.rot + 1) % 4);
    this.picker.setFlip(!this.picker.flip);
    this.say(this.picker.flip ? 'FLIPPED' : 'NOT FLIPPED');
  }

  /** Whether the next `def` placed is flipped: only wall pieces are. */
  private flipped(def: PropDef) {
    return def.place === 'mount' && this.picker.flip;
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

  private setSpawn(spawn: { pos: V3; yaw: number }) {
    this.level.spawn = spawn;
    this.player.setSpawnPoint(new THREE.Vector3(...spawn.pos), spawn.yaw);
    this.spawnMarker.set(spawn.pos, spawn.yaw);
  }

  private pickerInput(input: Input) {
    if (input.wheelSteps) this.picker.wheel(Math.sign(input.wheelSteps));
    const step = (input.wasTyped('KeyE') ? 1 : 0) - (input.wasTyped('KeyQ') ? 1 : 0);
    if (step) this.picker.step(step);
    const back = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? -1 : 1;
    if (input.wasTyped('Tab')) this.picker.variant(back);
    if (input.wasTyped('KeyF')) this.picker.cycleFinish('wall', back);
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
    const e = this.picker.choice;
    this.ghost.visible = !!target && e.kind !== 'spawn';
    this.spawnGhost.visible = !!target && e.kind === 'spawn';
    if (!target) {
      this.grid.visible = false;
      this.placement = null;
      return;
    }
    const spec: PlaceSpec = e.kind === 'prop' ? e.def : FLOOR_SPEC;
    const pl = place(spec, target, this.rot, this.floorAt, e.kind === 'prop' ? extentOf(e.def, this.rot) : undefined);
    if (e.kind === 'spawn') {
      // Room to stand there, facing where you look.
      const [x, y, z] = pl.pos;
      const r = PLAYER.radius;
      this.spawnGhost.set(pl.pos, this.player.yaw);
      this.valid = pl.ok && !this.level.overlaps([new THREE.Box3(new THREE.Vector3(x - r, y + 0.05, z - r), new THREE.Vector3(x + r, y + PLAYER.height, z + r))]);
      this.spawnGhost.setColor(this.valid ? GREEN : RED);
    } else {
      if (e.kind === 'prop') this.ghost.showProp(e.def, pl.pos, pl.rot, { ...this.level.stackContext(e.def, pl.pos, pl.rot), text: this.settings.texts.get(e.def.type), mirror: this.flipped(e.def) });
      else this.ghost.showPickup(pl.pos);
      // Like Minecraft, never place into yourself (a held LMB pillar stops at your eyes), nor onto a copy of itself.
      this.valid = pl.ok && !this.level.overlaps(this.ghost.colliders) && !this.ghost.colliders.some((c) => c.containsPoint(eye)) && !this.occupied(e, pl.pos, pl.rot);
      this.ghost.setValid(this.valid);
    }
    this.placement = { pos: pl.pos, rot: pl.rot };
    const module = spec.snap >= H_MODULE;
    this.grid.visible = true;
    this.grid.update(target.point, target.normal, module ? H_MODULE : spec.snap, module ? V_MODULE : spec.snap);
  }

  /**
   * Is a copy of `e` already standing at `pos`? Props without colliders (lamps,
   * cables) and pickups never overlap anything, so a held LMB would pile them up.
   */
  private occupied(e: Choice, pos: V3, rot: number) {
    if (e.kind === 'prop') return propAt(this.level.props.values(), e.def, pos, rot) !== undefined;
    return e.kind === 'pickup' && [...this.pickups.list.values()].some((p) => p.pos.every((v, i) => Math.abs(v - pos[i]) < 0.01));
  }

  /** Repeats (LMB held) skip quietly when the ghost is blocked, e.g. still on the block just placed. The spawn point never repeats. */
  private placeCurrent(repeat: boolean) {
    const e = this.picker.choice;
    if (!this.placement || (repeat && e.kind === 'spawn')) return;
    if (!this.valid) return repeat ? undefined : this.say('BLOCKED');
    const { pos, rot } = this.placement;
    if (e.kind === 'spawn') {
      this.history.push({ op: 'move', kind: 'spawn', id: 0, data: this.level.spawn });
      this.setSpawn({ pos, yaw: +this.player.yaw.toFixed(3) });
      this.say('SPAWN SET');
    } else if (e.kind === 'prop') {
      const inst = this.level.add({ type: e.def.type, variant: e.def.variant, pos, rot, mirror: this.flipped(e.def) || undefined, text: this.settings.texts.get(e.def.type), finish: this.picker.finishFor(e.def) });
      if (inst) this.history.push({ op: 'add', kind: 'prop', id: inst.id, data: null });
    } else {
      const p = this.pickups.add(e.type, pos);
      if (p) this.history.push({ op: 'add', kind: 'pickup', id: p.id, data: null });
    }
    // Keep building on the level you just built on when aiming into empty space.
    this.workLevel = levelOf(pos[1]);
    this.valid = false; // re-checked next frame against the new prop
  }

  /** The pickup or prop a hit belongs to (Level.targetOf: joint posts belong to the nearest edge prop; stepladders to no one). */
  private targetOf(hit: (Hit & { object: THREE.Object3D | null }) | null): Target | null {
    if (!hit?.object) return null;
    const pid = this.pickups.idOf(hit.object);
    if (pid !== undefined) return { kind: 'pickup', id: pid };
    const id = this.level.targetOf(hit.object, hit.point);
    return id === undefined ? null : { kind: 'prop', id };
  }

  /** Outline the target, as it is now. */
  private outlineTarget(t: Target | null) {
    const inst = t?.kind === 'prop' ? this.level.props.get(t.id) : undefined;
    const pk = t?.kind === 'pickup' ? this.pickups.list.get(t.id) : undefined;
    this.outline.visible = !!(inst || pk);
    if (pk) this.outline.showPickup(pk.pos);
    if (!inst) return;
    const def = defOf(inst.type, inst.variant)!;
    this.outline.showProp(def, inst.pos, inst.rot, { ...this.level.stackContext(def, inst.pos, inst.rot), adjust: inst.adjust, text: inst.text, mirror: inst.mirror });
  }

  private remove(t: Target) {
    const pk = t.kind === 'pickup' ? this.pickups.list.get(t.id) : undefined;
    if (pk) {
      this.history.push({ op: 'remove', kind: 'pickup', id: pk.id, data: { kind: pk.kind, pos: pk.pos } satisfies PickupData });
      this.pickups.remove(pk.id);
      return;
    }
    const inst = t.kind === 'prop' ? this.level.props.get(t.id) : undefined;
    if (!inst) return;
    this.history.push({ op: 'remove', kind: 'prop', id: inst.id, data: { id: inst.id, type: inst.type, variant: inst.variant, pos: inst.pos, rot: inst.rot, adjust: inst.adjust, text: inst.text, finish: inst.finish, mirror: inst.mirror } satisfies PropData });
    this.level.remove(inst.id);
  }

  private pickFrom(t: Target) {
    if (t.kind === 'pickup') {
      const kind = this.pickups.list.get(t.id)!.kind;
      this.picker.pick((c) => c.kind === 'pickup' && c.type === kind);
      return this.say(`PICKED ${this.picker.label.toUpperCase()}`);
    }
    const inst = this.level.props.get(t.id);
    if (inst && defOf(inst.type, inst.variant)) {
      this.picker.pick((c) => c.kind === 'prop' && c.def.type === inst.type && c.def.variant === inst.variant);
      if (defOf(inst.type, inst.variant)?.finishes) this.picker.pickFinish(inst.finish);
      this.rot = inst.rot;
      this.picker.setFlip(!!inst.mirror);
      if (inst.text !== undefined) this.settings.texts.set(inst.type, inst.text);
      else this.settings.texts.delete(inst.type);
      this.say(`PICKED ${this.picker.label.toUpperCase()}`);
    }
  }

  private revert(e: HistoryEntry): number | undefined {
    if (e.op === 'move') {
      this.setSpawn(e.data as { pos: V3; yaw: number });
      return undefined;
    }
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
