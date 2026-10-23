import './dev.css';
import type * as THREE from 'three';
import { BuildMode } from '../build/buildmode';
import { DebugPanel } from '../debug/panel';
import { live, type Hooks } from '../debug/tuning';
import type { GpuTimer } from '../debug/gpu-timer';
import type { Input } from '../input';
import type { Hud } from '../hud';
import type { Audio } from '../audio';
import type { Hotbar } from '../inventory/hotbar';
import { msg } from '../messages';
import type { Notify } from '../notify';
import type { NotifyView } from '../notify-view';
import { MessageTools } from './message-tools';
import { startSizes, type Inventory } from '../inventory/inventory';
import type { Level } from '../level/level';
import type { LevelData } from '../level/level-data';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import type { Pickups } from '../pickups/pickups';
import type { Player } from '../player';
import type { PlayState } from '../play-state';
import type { LightBaker } from '../render/bake/baker';
import type { Environment } from '../render/environment';
import { session } from '../session';
import { shapes } from '../tools/shapes';
import { syncSkyline } from '../skyline';
import { AvatarPreview } from './avatar-preview';
import { layoutCity } from '../city/layout';
import { dressTower, wallSigns } from '../city/rooftops';
import { Ghost } from './ghost';
import { Profiler } from './profiler';
import { WetView } from './wet-view';
import { RunsView } from './runs-view';
import { RUNS_VIEW, WET_VIEW } from '../config';
import type { PaintOps } from '../paint-ops';
import type { Tools } from '../tools/tools';

// Dev tools: build mode (B), the F3 panel (built after the hooks it calls), and window.game
// for the console and the tests. Single player only: main loads this module
// only with the dev tools (the player build, npm run build, leaves it out), and in a session
// the keys do nothing and both are closed.

/** What the dev tools reach into. Main passes all of window.game, which holds more. */
export interface DevContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  input: Input;
  play: PlayState;
  hud: Hud;
  audio: Audio;
  hotbar: Hotbar;
  notify: Notify;
  notifyView: NotifyView;
  inventory: Inventory;
  level: Level;
  pickups: Pickups;
  player: Player;
  tools: Tools;
  paint: PaintSystem;
  paintOps: PaintOps;
  drips: PaintDrips;
  environment: Environment;
  baker: LightBaker;
  gpuTimer: GpuTimer;
  /** The generated city around the level. */
  city(): THREE.Object3D;
  /** The renderer's pixel ratio from Settings, and what is sized by it. */
  applyPixelScale(): void;
  rebuildCity(): void;
  /** The level as a file: props, pickups, city overrides. */
  levelData(): LevelData;
  /** Its name (a file in public/levels, or the file opened in build mode). */
  levelName(): string;
  /** A level file was opened in build mode. */
  openLevel(data: LevelData, name: string): void;
}

/** The frame's numbers, for the panel's readouts and the profiler. */
interface FrameStats {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  /** Real time since the last frame (ms). */
  interval: number;
}

export class DevTools {
  private build: BuildMode;
  private debug: DebugPanel;
  private figure: AvatarPreview;
  private ghost: Ghost;
  private profiler: Profiler;
  private messages: MessageTools;
  private wet: WetView;
  private runs: RunsView;
  /** The game had the mouse when the panel opened: closing it goes back. */
  private resumeOnClose = false;
  /** Paint ops per second: counted over a second at a time. */
  private opsFrom = { count: 0, time: 0 };
  /** A model changed in F3 since the last frame. */
  private modelsChanged = false;

  constructor(private g: DevContext) {
    this.build = new BuildMode(g.scene, g.level, g.pickups, g.player, g.renderer, g.paint);
    this.build.getLevelData = g.levelData;
    this.build.getLevelName = g.levelName;
    this.build.onLoad = g.openLevel;
    this.figure = new AvatarPreview(g.scene);
    this.ghost = new Ghost(g);
    this.messages = new MessageTools(g.notify);
    this.profiler = new Profiler(g);
    this.wet = new WetView(g.scene, g.paint, () => g.player.position);
    this.runs = new RunsView(g.scene, g.drips, g.paint);
    if (new URLSearchParams(location.search).has('profile')) this.profiler.start();
    const hooks: Hooks = {
      gpu: (label: string) => g.gpuTimer.read(label),
      strikeLightning: () => g.environment.lightning.strike(),
      rebuildLights: () => g.environment.lightFx.rebuild(g.level.lights),
      // Props with lights (light props, billboards) are rebuilt for a new lens color or aim; their paint carries over.
      rebuildLightProps: () => g.level.rebuildLit(),
      syncAtmosphere: () => g.environment.atmosphere.syncColors(),
      syncVignette: () => g.hud.syncVignette(),
      previewPause: () => g.hud.menu.previewSheet(),
      applyDaylight: () => g.environment.atmosphere.reapplyDaylight(),
      syncBuildLook: () => this.build.syncLook(),
      rebuildCity: g.rebuildCity,
      applyToolSizes: () => (g.inventory.size = startSizes()),
      unlockAll: () => {
        g.inventory.unlockAll();
        g.pickups.collectOwned(g.inventory);
        g.notify.event(msg('toast.unlockedAll'));
      },
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
      message: (a) => this.messages.run(a),
      messageHint: (i) => this.messages.showHint(i),
      messageHintShown: () => this.messages.hint,
      syncNotify: () => g.notifyView.syncLook(),
      ghostRecord: () => this.ghost.record(),
      ghostPlay: () => this.ghost.play(),
      ghostFollow: () => this.ghost.follow(),
      ghostStop: () => this.ghost.stop(),
      ghostState: () => this.ghost.label,
      ghostNet: () => this.ghost.net,
      wetBuildUp: () => this.wet.label,
      profileToggle: () => this.profiler.toggle(),
      profileProbe: () => this.profiler.runProbe(),
      profileState: () => (this.profiler.recording ? 'RECORDING' : 'off'),
    };
    this.debug = new DebugPanel(hooks, () => g.environment.atmosphere.nightValues);
    Object.assign(window, { game: { ...g, build: this.build, debug: this.debug, hooks, live, ghost: this.ghost, wetView: this.wet, runsView: this.runs, profiler: this.profiler, cityParts: { layoutCity, dressTower, wallSigns } } });
  }

  /** Where the test figures stand besides the session's players (the ghost): a stepladder can't go there. */
  get figures() {
    const p = this.ghost.position;
    return p ? [p] : [];
  }

  /**
   * Start of a frame: F3 / ` opens and closes the panel, B build mode (in a session both
   * close and stay closed); the test figure and the ghost move even while
   * paused, so you can watch them with the panel open.
   */
  frame(input: Input, dt: number) {
    this.profiler.begin();
    // Profiling works in a session too: F8 records, F9 probes, F2 marks a spike.
    if (input.wasPressed('F8')) this.profiler.toggle();
    if (input.wasPressed('F9')) this.profiler.runProbe();
    if (input.wasPressed('F2')) this.profiler.mark();
    if (this.modelsChanged) this.rebuildModelsNow();
    this.figure.update(dt);
    this.ghost.update(dt);
    this.wet.update(dt, WET_VIEW.enabled);
    this.runs.update(dt, RUNS_VIEW.enabled);
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

  /** The frame's CPU time since the last mark goes to `name` (profiling mode). */
  lap(name: string) {
    this.profiler.lap(name);
  }

  /** The GPU timer is wanted: the panel is open or the profiler records (main.ts turns it on). */
  get timesGpu() {
    return this.debug.visible || this.profiler.recording;
  }

  /** End of frame: the profiler, and the panel's readouts (only while it's open). */
  report({ fps, frameMs, calls, triangles, interval }: FrameStats) {
    const g = this.g;
    this.profiler.frame({ interval, calls, triangles, state: g.play.mode });
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
      lights: g.environment.lighting.active,
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

  /**
   * Opening frees the mouse for the panel; Esc then goes back to the game and
   * to the panel again (play-state.ts). Closing with the key (`byKey`)
   * goes back to the game if that's where the panel was opened.
   */
  private setPanel(open: boolean, input: Input, byKey = false) {
    if (open === this.debug.visible) return;
    this.debug.toggle();
    if (open) {
      this.resumeOnClose = input.locked;
      if (input.locked) document.exitPointerLock();
    } else if (byKey && this.resumeOnClose && !input.locked) input.requestLock();
    this.g.play.setPanel(this.debug.visible);
  }

  private setBuilding(on: boolean) {
    this.build.setActive(on);
    this.g.play.building = on;
    this.g.environment.atmosphere.setDaylight(on);
    this.debug.sync();
    this.g.hotbar.visible = !on;
    this.g.audio.setHiss(0, 0);
  }
}
