import './style.css';
import * as THREE from 'three';
import * as config from './config';
import { flyCamera, titleCamera } from './render/title-view';
import { ATMOS, COLORS, HUD, LEVELS, PLAYER, PRESSURE, RENDER, VOLUMETRICS, WALL_HAND } from './config';
import { syncSharedUniforms } from './materials';
import { syncTrackUniforms } from './render/cctv-track';
import { LightBaker } from './render/bake/baker';
import { PostPipeline } from './render/post';
import { Environment } from './render/environment';
import { PaintDrips } from './paint-drips';
import { PaintOps } from './paint-ops';
import { paintMenu } from './save/paint-menu';
import { WallHand } from './tools/wall-hand';
import { GpuTimer } from './debug/gpu-timer';
import { captureDefaults } from './debug/defaults';
import { pixelRatio, Settings } from './settings';
import { readGpu } from './gpu-name';
import { PerfTest } from './perf-test';
import { perfTestPage } from './perf-test-page';
import { saveScreenshot } from './screenshot';
import { Input } from './input';
import { guardBrowser } from './browser-guards';
import { PlayState } from './play-state';
import { Player } from './player';
import { PaintSystem } from './painting';
import { Level } from './level/level';
import type { LevelData } from './level/level-data';
import { FrameMeter } from './frame-meter';
import { updateSkyline } from './skyline';
import { syncCityLight } from './city/material';
import { Tools } from './tools/tools';
import { Inventory } from './inventory/inventory';
import { Hotbar } from './inventory/hotbar';
import { sentence } from './menu-ui';
import { msg } from './messages';
import { Notify } from './notify';
import { NotifyView } from './notify-view';
import { Tutorial } from './tutorial/tutorial';
import { TutorialWire } from './tutorial/wire';
import { Thumbnails } from './inventory/thumbnails';
import { Pickups } from './pickups/pickups';
import { OpenLevel } from './level/open-level';
import { Audio } from './audio';
import { Hud } from './hud';
import { drawsFromPlayer, frameDrawn, loadFailed, loadStep } from './loading';
import { fetchLevel } from './build/io';
import { levelPaintOf, putLevelPaint } from './save/level-paint';
import { jpFontReady } from './render/ink/jp-font';
import { textAtlasVersion } from './render/ink/text-atlas';
import { staticTextureBytes } from './render/texture-bytes';
import type { DevTools } from './dev/devtools';
import { session } from './session';
import { multiplayerMenu } from './net/net-menu';
import { seedPaintRandom } from './lcg';
import { fanLevel, metalDrops } from './emitter-sounds';
import { guarded } from './frame-guard';

// F3's defaults before anything changes config (the panel isn't in the player build).
if (__DEV_TOOLS__) captureDefaults();
// Players start without the performance lines; SETTINGS → GRAPHICS turns them on.
else HUD.perf = false;
// Settings first: they may change the pixel scale the renderer starts with,
// and the paint detail the level is built with.
const settings = new Settings(applyPixelScale, () => level.rebuildAll(), () => opened.rebuildCity());
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const gpuTimer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
/** What the game draws with, read once (Settings, the perf lines). */
const gpu = readGpu(renderer.getContext());
/** Settings → Performance test (perf-test.ts): the city view measured for a few seconds, on the player's request only. */
const perfTest = new PerfTest(gpuTimer);
const post = new PostPipeline(renderer, gpuTimer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(RENDER.fov, window.innerWidth / window.innerHeight, 0.05, 2000);
scene.add(camera);
// The can is drawn in a second pass so it never clips into walls.
const viewScene = new THREE.Scene();
const environment = new Environment(scene, viewScene, renderer);

const paint = new PaintSystem();
renderer.domElement.addEventListener('webglcontextrestored', () => paint.reupload());
const drips = new PaintDrips(paint);
const paintOps = new PaintOps(paint, drips);
const level = new Level(scene, paint);
const baker = new LightBaker();
baker.onDecorBaked = (geo) => level.pushBaked(geo);
baker.onRelayout = () => level.remerge();
environment.lightning.onThunder = (d) => audio.thunder(d);
level.onChange = (runtime) => {
  baker.sync(level.builtProps, runtime);
  // A runtime prop (the stepladder) has no lamps or smoke, and is too thin to shelter rain.
  if (!runtime) environment.rebuild(level);
};
/** Glow and smoke sprites are sized in the drawing buffer's pixels. */
function syncViewSize() {
  environment.setViewHeight(renderer.getDrawingBufferSize(new THREE.Vector2()).y);
}
syncViewSize();

const input = new Input(renderer.domElement);
/** Nothing pressed: what the player and tools get while paused in a session. */
const noInput = new Input();
const audio = new Audio();
const hud = new Hud();
const player = new Player(level.colliders, level.ladders);
const inventory = new Inventory();
const thumbnails = new Thumbnails(renderer);
const hotbar = new Hotbar(thumbnails);
const notify = new Notify();
const notifyView = new NotifyView(notify);
const tutorial = new Tutorial(notify);
const tools = new Tools(scene, viewScene, paint, level.solids, audio, inventory, level);
tools.onFact = (f) => tutorial.fact(f);
const tutorialWire = new TutorialWire(tutorial, player, inventory, level.ladders);
tools.ladder.onBlocked = () => notify.toast(msg('toast.ladderBlocked'));
const wallHand = new WallHand(level.solids);
viewScene.add(wallHand.group);
const pickups = new Pickups(scene, camera, level.solids);
pickups.onCollect = (label) => {
  audio.pickup();
  notify.toast(msg('toast.pickedUp', { item: sentence(label) }));
};
pickups.onBlocked = (label) => notify.toast(msg('toast.alreadyHave', { item: sentence(label) }));
function applyPixelScale() {
  renderer.setPixelRatio(pixelRatio());
  syncViewSize();
}

const opened = new OpenLevel({ scene, level, pickups, inventory, drips, paint, player }, new URLSearchParams(location.search).get('level') ?? LEVELS.start);

/** The level is built, lit and painted (loading.ts): until then the game doesn't run. */
let loaded = false;
// The hints' font loads meanwhile, not awaited: the first hint doesn't flash in the fallback.
void document.fonts.load('500 1em Montserrat').catch(() => {});
// Signs measure their text when they are built: wait for the sign font first.
Promise.all([fetchLevel(opened.name), jpFontReady()])
  .then(async ([data]) => {
    await loadStep(msg('menu.loadRoof'));
    opened.load(data);
    // The level's merged meshes first: their shaders are most of what's compiled.
    level.flush();
    // Where the browser compiles shaders in parallel, they compile during the next steps.
    // With the lights set up as the game draws them: their number is in the shaders.
    environment.lighting.update(player.position, camera.matrixWorldInverse);
    post.warm(scene, viewScene, camera);
    thumbnails.warm();
    await loadStep(msg('menu.loadLamps'));
    baker.update(0, player.position);
    await loadStep(msg('menu.loadPaint'));
    await putLevelPaint(paint, drips, opened.name, data);
    loaded = true;
    // A reload in a session goes back into it (multiplayer.ts), with the session's paint.
    net.resume();
  })
  .catch((e) => {
    console.error(e);
    loadFailed();
  });

let lastStride = 0;
let textAtlasSeen = textAtlasVersion();
player.onLand = (speed) => audio.footstep(speed > PLAYER.hardLanding);

const play = new PlayState(input, session, {
  release: () => document.exitPointerLock(),
  resume: () => input.requestLock(),
  page: () => hud.menu.onPage,
  back: () => hud.menu.goBack(),
  primary: () => hud.menu.primary(),
  dialog: () => notify.blocked,
  confirm: (accepted) => notify.confirm(accepted),
});
input.onMenuKey = (code, down, repeat) => play.key(code, down, repeat);
guardBrowser(() => !play.paused);
// Esc held to the end: the browser left fullscreen, and its release doesn't resume.
document.addEventListener('fullscreenchange', () => play.disarm());
const showMenu = () => hud.setLocked(input.locked, play.panel);
play.onPanel = showMenu;
// Losing pointer lock (Esc, alt-tab, a file dialog) pauses the game behind the menu.
input.onLockChange = (locked) => {
  showMenu();
  if (locked) {
    settings.applyPending();
    audio.start();
  } else {
    audio.setHiss(0, 0);
    audio.setScribble(0);
  }
};
input.onResume = hud.menu.onResume = () => play.resume();
hud.menu.onStyle = (i) => settings.setStyle(i);
showMenu();
const testPage = perfTestPage(hud.menu, perfTest, gpu, () => settings.tested());
hud.menu.setSettings(settings.sections(gpu, testPage.run, tutorial));
// SAVE in a session downloads the session's paint, from the server.
const paintFile = paintMenu(hud.menu, paint, drips, () => opened.name, () => net.savePaint());
const net = multiplayerMenu(hud.menu, notify, { scene, camera, level, paint, paintOps, drips, player, inventory, pickups, tools, paused: () => play.paused, lastActive: () => input.lastActive, levelData: () => ({ data: opened.toJSON(), name: opened.name }), levelPaint: () => levelPaintOf(opened.name), openLevel: (d, n) => opened.open(d, n), restartLevel: () => opened.restart(), lockDetail: (tpm) => settings.lockPaintDetail(tpm), ownDetail: () => settings.useOwnDetail() });
// A stepladder can't stand where the session's players or F3's figures (the ghost) are.
tools.ladder.others = () => [...net.shown, ...(dev?.figures ?? [])];
tools.onCapChange = (name) => hud.showCapTag(name);
tools.onColorChange = (color) => hud.showColorTag(color, COLORS[color]);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  applyPixelScale(); // a zoom changes devicePixelRatio
});

const eye = new THREE.Vector3();
/** The level's middle while the performance test flies around it (render/title-view.ts). */
let flyAround: THREE.Vector3 | null = null;
const timer = new THREE.Timer();
const meter = new FrameMeter();
let fov = RENDER.fov;
const tagPos = new THREE.Vector3();
/** Test hook (golden paint test): a fixed dt and a script run at the start of every frame, so paint follows the frame count, not wall time. */
const fixedStep: { dt: number; script: (() => void) | null } = { dt: 0, script: null };

/** When the last frame was drawn (rAF time), for the frame rate limit (RENDER.maxFps). */
let drawnAt = -Infinity;

function frame(time: number) {
  // First: a frame that throws must not stop the game (and the session's check for a silent server with it).
  requestAnimationFrame(frame);
  if (loaded) guarded(step, time);
}

function step(time: number) {
  // Frame rate limit: skip display refreshes until a frame is due. Frames are
  // due one interval after the last was due, so the average is exact on any
  // display rate; after a stall it starts over.
  if (RENDER.maxFps > 0 && !fixedStep.dt) {
    const interval = 1000 / RENDER.maxFps;
    const since = time - drawnAt;
    if (since < interval - 0.5) return;
    drawnAt = since < interval * 2 ? drawnAt + interval : time;
  }
  meter.start();
  const begun = performance.now();
  timer.update(time);
  const delta = timer.getDelta();
  fixedStep.script?.();
  const dt = fixedStep.dt || Math.min(delta, 1 / 20);

  dev?.frame(input, dt);
  const building = play.building;

  // Paused (pointer not locked) in single player the game stops: you, your tools,
  // paint in flight, drips, pickups and lightning. The surroundings go on (fans,
  // lamps, CCTV, rain, smoke), and all sound is turned down (AUDIO.pausedGain;
  // not with F3 open, to tune it). In a session the game goes on without you:
  // you stand still, but you still fall, your spray lands and paint runs, as
  // others see it.
  const { paused, frozen } = play;
  const yours = paused || notify.blocked ? noInput : input;
  tutorialWire.before();
  if (!frozen) player.update(dt, yours);
  if (player.onGround && player.stride - lastStride > PLAYER.footstepStride) {
    lastStride = player.stride;
    audio.footstep();
  }

  player.eye(eye);
  camera.position.copy(eye);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  // FOV widens a little while sprinting.
  const fovTarget = RENDER.fov + (player.sprinting ? RENDER.sprintFovBoost : 0);
  fov += (fovTarget - fov) * (1 - Math.exp(-RENDER.sprintFovEase * dt));
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
  // The title screen shows a fixed view of the city, without hands or tools; the performance test
  // flies from it around the level. They draw from a camera of their own; play (aim, tools) keeps yours.
  const cityView = (hud.cityView || perfTest.running) && !drawsFromPlayer();
  viewScene.visible = !cityView;
  if (perfTest.running) flyAround ??= level.totalBounds().getCenter(new THREE.Vector3());
  else flyAround = null;
  const shown = !cityView ? camera : flyAround ? flyCamera(camera, perfTest.progress(time), flyAround) : titleCamera(camera);
  const at = shown.position;
  dev?.lap('player');
  updateSkyline(opened.city, at);
  syncSharedUniforms(time / 1000);
  syncTrackUniforms(at);
  environment.update({ time, dt, at, shown, eye, fov: camera.fov, frozen, building });
  syncCityLight(environment.lighting);
  dev?.lap('environment');
  audio.setFan(fanLevel(level.emitters, eye));
  if (ATMOS.rain && !building) metalDrops(audio, level.emitters, environment.heightmap, camera, dt, eye);
  audio.update(paused && !play.panel);
  dev?.lap('audio');

  if (!frozen) {
    if (building) dev!.update(input, camera);
    tools.update(dt, yours, camera, eye, player, !building);
    wallHand.update(dt, camera, eye, WALL_HAND.enabled && !building, tools.spray.model.sway);
    drips.update(dt);
    pickups.update(dt, player.position, inventory);
  } else {
    if (!building) tools.holdStill(camera);
    // Tuned live in F3 → Items → Pickups, which pauses the game.
    if (play.panel) pickups.update(dt, player.position, inventory);
  }
  net.update(dt);
  const tool = building ? null : inventory.tool;
  hud.setCrosshair(tools.crosshair(tool));
  const anchor = tools.labelAnchor(tagPos);
  const pressure = tool === 'can' ? inventory.pressure : null;
  hud.placeToolTags(anchor ? toScreen(anchor) : null, pressure, pressure !== null && pressure < PRESSURE.sputterThreshold);
  // A lettering atlas grew or started over: the signs ask for their rects again.
  if (textAtlasVersion() !== textAtlasSeen) {
    textAtlasSeen = textAtlasVersion();
    level.rebuildLettered();
  }
  dev?.lap('tools');
  level.flush();
  dev?.lap('level');
  baker.update(time / 1000, at);
  dev?.lap('bake');
  paint.settle();
  paint.gpu.flush(renderer);
  hotbar.update(inventory);
  hud.update();
  const visible = input.locked && !play.panel && !building && document.visibilityState === 'visible';
  notify.update(dt, visible);
  tutorialWire.frame(dt, visible, yours);
  notifyView.update();
  dev?.lap('paint + hud');

  // The CPU time before the draw calls: a GPU that falls behind stalls them (the performance test's CPU time).
  const beforeDraw = performance.now() - begun;
  perfTest.beforeDraw();
  post.render(scene, viewScene, shown, environment.lighting, !building);
  frameDrawn();
  dev?.lap('render');
  // Same frame as the render: the canvas still holds it (see screenshot.ts). Only while playing: not on the title or pause screen, nor with F3 open.
  if (yours.justPressed('screenshot')) saveScreenshot(renderer.domElement, () => (notify.toast(msg('toast.screenshot')), tutorial.fact({ type: 'screenshot' })));
  gpuTimer.poll();
  const { calls, triangles } = post.sceneStats;
  perfTest.frame(time, beforeDraw, calls);

  input.endFrame();

  meter.end(delta);
  const { fps, frameMs } = meter;
  // The one writer of the timer, for the next frame: the HUD's GPU line or the dev tools (F3, profiling); the performance test turns it on for its run.
  gpuTimer.enabled = (HUD.perf && HUD.perfGpu) || !!dev?.timesGpu;
  const gpuMs = !HUD.perfGpu ? undefined : gpuTimer.supported ? gpuTimer.total(VOLUMETRICS.enabled ? ['scene', 'volumetrics', 'post'] : ['scene', 'post']) : null;
  hud.setPerf({ fps, frameMs, gpuName: gpu.name, gpu: gpuMs, calls, triangles, textureBytes: paint.gpu.textureBytes + baker.stats.textureBytes + staticTextureBytes(), net: net.stats });
  dev?.report({ fps, frameMs, calls, triangles, interval: delta * 1000 });
}
requestAnimationFrame(frame);

function toScreen(p: THREE.Vector3) {
  p.project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - p.y * 0.5) * window.innerHeight };
}

// Dev tools (build mode, F3, window.game): single player only, and not in the player build (npm run build).
let dev: DevTools | undefined;
const game = { city: () => opened.city, applyPixelScale, config, gpu, perfTest, testPage, settings, play, environment, audio, wallHand, drips, baker, player, tools, inventory, hotbar, notify, notifyView, pickups, paint, paintOps, net, paintFile, seedPaintRandom, fixedStep, session, level, renderer, input, hud, scene, viewScene, gpuTimer, PLAYER, loadLevel: (d: LevelData) => opened.load(d), rebuildCity: () => opened.rebuildCity(), levelData: () => opened.toJSON(), levelName: () => opened.name, openLevel: (d: LevelData, n: string) => opened.open(d, n), loaded: () => loaded };
if (__DEV_TOOLS__) void import('./dev/devtools').then((m) => (dev = new m.DevTools(game)));
