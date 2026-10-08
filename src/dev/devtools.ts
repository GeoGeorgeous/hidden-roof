import type * as THREE from 'three';
import { BuildMode } from '../build/buildmode';
import { DebugPanel } from '../debug/panel';
import { live } from '../debug/tuning';
import type { GpuTimer } from '../debug/gpu-timer';
import { MARKER, ROLLER, SPONGE } from '../config';
import type { Input } from '../input';
import type { Hud } from '../hud';
import type { Audio } from '../audio';
import type { Hotbar } from '../inventory/hotbar';
import type { Inventory } from '../inventory/inventory';
import type { Level, LevelData } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import type { Pickups } from '../pickups/pickups';
import type { Player } from '../player';
import type { Atmosphere } from '../render/atmosphere';
import type { LightBaker } from '../render/bake/baker';
import type { LightFX } from '../render/light-fx';
import type { Lighting } from '../render/lighting';
import type { Lightning } from '../render/lightning';
import { session } from '../session';
import { shapes } from '../tools/shapes';
import { syncSkyline } from '../skyline';
import { AvatarPreview } from './avatar-preview';
import { layoutCity } from '../city/layout';
import { dressTower, wallSigns } from '../city/rooftops';
import { Ghost } from './ghost';
import type { PaintOps } from '../paint-ops';
import type { Tools } from '../tools/tools';

// Dev tools: build mode (B), the F3 panel with its live hooks, and window.game
// for the console and the tests. Single player only: main loads this module
// only in the normal build (npm run build:mp leaves it out), and in a session
// the keys do nothing and both are closed.

/** What the dev tools reach into. Main passes all of window.game, which holds more. */
export interface DevContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  input: Input;
  hud: Hud;
  audio: Audio;
  hotbar: Hotbar;
  inventory: Inventory;
  level: Level;
  pickups: Pickups;
  player: Player;
  tools: Tools;
  paint: PaintSystem;
  paintOps: PaintOps;
  drips: PaintDrips;
  atmosphere: Atmosphere;
  lighting: Lighting;
  lightFx: LightFX;
  lightning: Lightning;
  baker: LightBaker;
  gpuTimer: GpuTimer;
  rebuildCity(): void;
  /** The level as a file: props, pickups, city overrides. */
  levelData(): LevelData;
  /** A level file was opened in build mode. */
  openLevel(data: LevelData, name: string): void;
}

/** The frame's numbers, for the panel's readouts. */
interface FrameStats {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
}

export class DevTools {
  private build: BuildMode;
  private debug = new DebugPanel();
  private figure: AvatarPreview;
  private ghost: Ghost;
  /** The game had the mouse when the panel opened: closing it goes back. */
  private resumeOnClose = false;
  /** Paint ops per second: counted over a second at a time. */
  private opsFrom = { count: 0, time: 0 };
  /** A model changed in F3 since the last frame. */
  private modelsChanged = false;

  constructor(private g: DevContext) {
    this.build = new BuildMode(g.scene, g.level, g.pickups, g.player, g.renderer);
    this.build.getLevelData = g.levelData;
    this.build.onLoad = g.openLevel;
    this.figure = new AvatarPreview(g.scene);
    this.ghost = new Ghost(g);
    // The ghost, besides the players of a session (net/multiplayer.ts).
    const players = g.tools.ladder.others;
    g.tools.ladder.others = () => {
      const p = this.ghost.position;
      return p ? [...players(), p] : players();
    };
    Object.assign(live, {
      gpu: (label: string) => g.gpuTimer.read(label),
      strikeLightning: () => g.lightning.strike(),
      rebuildLights: () => g.lightFx.rebuild(g.level.lights),
      // Props with lights (light props, billboards) are rebuilt for a new lens color or aim; their paint carries over.
      rebuildLightProps: () => g.level.rebuildLit(),
      syncAtmosphere: () => g.atmosphere.syncColors(),
      syncVignette: () => g.hud.syncVignette(),
      previewPause: () => g.hud.previewSheet(),
      applyDaylight: () => g.atmosphere.reapplyDaylight(),
      syncBuildLook: () => this.build.syncLook(),
      atmosNight: () => g.atmosphere.nightValues,
      rebuildCity: g.rebuildCity,
      applyToolSizes: () => (g.inventory.size = { marker: MARKER.width, roller: ROLLER.width, sponge: SPONGE.width }),
      // Once per frame however many slider ticks came in (rebuildModelsNow).
      rebuildModels: () => (this.modelsChanged = true),
      syncSkyline,
      avatarToggle: () => this.figure.toggle(g.player.position, g.player.yaw),
      avatarNext: () => this.figure.next(),
      avatarPrevious: () => this.figure.previous(),
      avatarPick: () => this.figure.pick(),
      avatarCycle: () => this.figure.cycle(),
      avatarRestyle: () => {
        this.figure.restyle();
        this.ghost.restyle();
      },
      avatarPose: () => this.figure.label,
      ghostRecord: () => this.ghost.record(),
      ghostPlay: () => this.ghost.play(),
      ghostFollow: () => this.ghost.follow(),
      ghostStop: () => this.ghost.stop(),
      ghostState: () => this.ghost.label,
      ghostNet: () => this.ghost.net,
    });
    g.input.escapeResumes = () => this.debug.visible;
    Object.assign(window, { game: { ...g, build: this.build, debug: this.debug, live, ghost: this.ghost, cityParts: { layoutCity, dressTower, wallSigns } } });
  }

  get building() {
    return this.build.active;
  }

  get panelOpen() {
    return this.debug.visible;
  }

  /**
   * Start of a frame: F3 / ` opens and closes the panel, B build mode (in a session both
   * close and stay closed); the test figure and the ghost move even while
   * paused, so you can watch them with the panel open.
   */
  frame(input: Input, dt: number) {
    if (this.modelsChanged) this.rebuildModelsNow();
    this.figure.update(dt);
    this.ghost.update(dt);
    if (session.multiplayer) {
      this.figure.hide();
      this.ghost.stop();
      if (this.debug.visible) this.setPanel(false, input);
      if (this.build.active) this.setBuilding(false);
      return;
    }
    if (input.wasPressed('F3') || input.wasPressed('Backquote')) this.setPanel(!this.debug.visible, input, true);
    if (input.locked && input.wasPressed('KeyB')) this.setBuilding(!this.build.active);
  }

  /** Build mode's editing, while it's on and the game isn't paused. */
  update(input: Input, camera: THREE.Camera) {
    this.build.update(input, camera);
  }

  /** End of frame: the panel's readouts (only while it's open). */
  report({ fps, frameMs, calls, triangles }: FrameStats) {
    const g = this.g;
    g.gpuTimer.enabled = this.debug.visible;
    if (!this.debug.visible) return;
    Object.assign(live.stats, {
      fps,
      frameMs,
      drawCalls: calls,
      triangles,
      textures: g.paint.gpu.textureCount,
      textureBytes: g.paint.gpu.textureBytes,
      surfaces: g.paint.surfaces.length,
      uploads: g.paint.gpu.uploadsLastFrame,
      uploadBytes: g.paint.gpu.uploadBytesLastFrame,
      particles: g.tools.spray.particles.count,
      drips: g.drips.count,
      lights: g.lighting.active,
      bakedBytes: g.baker.stats.textureBytes,
      bakePending: g.baker.stats.pending,
      bakeMs: g.baker.stats.ms,
    });
    const now = performance.now();
    if (now - this.opsFrom.time >= 1000) {
      live.stats.paintOps = ((g.paint.opCount - this.opsFrom.count) * 1000) / (now - this.opsFrom.time);
      this.opsFrom = { count: g.paint.opCount, time: now };
    }
    const p = g.player;
    live.player = { position: p.position, velocity: p.velocity, state: p.fly ? 'flying' : p.onLadder ? 'on ladder' : p.crouched ? 'crouched' : p.onGround ? 'grounded' : 'airborne' };
    this.debug.update();
  }

  /**
   * Opening frees the mouse for the panel; Esc then goes back to the game and
   * to the panel again (Input.escapeResumes). Closing with the key (`byKey`)
   * goes back to the game if that's where the panel was opened.
   */
  /** Rebuild every tool model (first person, pickups, hotbar icons, the figure's tool) from MODELS and CAPS. */
  private rebuildModelsNow() {
    this.modelsChanged = false;
    const g = this.g;
    const t = g.tools;
    for (const m of [t.spray.model, t.marker, t.ladder.model, t.roller.model, t.sponge.model]) m.build();
    g.pickups.restyle();
    g.hotbar.refreshIcons();
    shapes.version++;
  }

  private setPanel(open: boolean, input: Input, byKey = false) {
    if (open === this.debug.visible) return;
    this.debug.toggle();
    if (open) {
      this.resumeOnClose = input.locked;
      if (input.locked) document.exitPointerLock();
    } else if (byKey && this.resumeOnClose && !input.locked) input.requestLock();
    this.g.hud.setLocked(input.locked, this.debug.visible);
  }

  private setBuilding(on: boolean) {
    this.build.setActive(on);
    this.g.atmosphere.setDaylight(on);
    this.debug.sync();
    this.g.hotbar.visible = !on;
    this.g.audio.setHiss(0, 0);
  }
}
