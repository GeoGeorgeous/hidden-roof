import * as THREE from 'three';
import * as config from './config';
import { ATMOS, AUDIO, COLORS, INK, PLAYER, PRESSURE, RENDER, SMOKE, THUNDER, VIEWMODEL } from './config';
import { syncSharedUniforms } from './materials';
import { syncTrackUniforms } from './render/cctv-track';
import { Lighting } from './render/lighting';
import { LightBaker } from './render/bake/baker';
import { LightFX } from './render/light-fx';
import { Rain } from './render/rain';
import { Heightmap } from './render/heightmap';
import { Atmosphere } from './render/atmosphere';
import { PostPipeline } from './render/post';
import { PlayerLight } from './render/player-light';
import { Smoke } from './render/smoke';
import { Lightning } from './render/lightning';
import { PaintDrips } from './paint-drips';
import { WallHand } from './tools/wall-hand';
import { GpuTimer } from './debug/gpu-timer';
import { Settings } from './settings';
import { saveScreenshot } from './screenshot';
import { Input } from './input';
import { Player } from './player';
import { PaintSystem } from './painting';
import { Level, type LevelData } from './level/level';
import { makeSky } from './sky';
import { buildSkyline, disposeSkyline, syncSkyline, updateSkyline, type SkylineSettings } from './skyline';
import { setLinePointScale } from './city/lines';
import { syncCityLight } from './city/material';
import { Tools } from './tools/tools';
import { Inventory } from './inventory/inventory';
import { Hotbar } from './inventory/hotbar';
import { Thumbnails } from './inventory/thumbnails';
import { Pickups, type PickupData } from './pickups/pickups';
import { Audio } from './audio';
import { Hud } from './hud';
import { BuildMode } from './build/buildmode';
import { fetchLevel } from './build/io';
import { jpFontReady } from './render/ink/jp-font';
import { textAtlasVersion } from './render/ink/text-atlas';
import { staticTextureBytes } from './render/texture-bytes';
import { DebugPanel } from './debug/panel';
import { live } from './debug/tuning';
import { exitGameFullscreen } from './fullscreen';
import { setHex } from './hex-color';

// Settings first: they may change the pixel scale the renderer starts with,
// and the paint detail the level is built with.
const settings = new Settings(
  () => live.applyPixelScale(),
  () => level.rebuildAll(),
  () => live.rebuildCity(),
);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1 / RENDER.pixelScale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
const gpuTimer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext);
const post = new PostPipeline(renderer, gpuTimer);
live.gpu = (label) => gpuTimer.read(label);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(INK.paper, ATMOS.fogDensity);
const camera = new THREE.PerspectiveCamera(RENDER.fov, window.innerWidth / window.innerHeight, 0.05, 2000);
scene.add(camera);
const sky = makeSky();
scene.add(sky);

// The can is drawn in a second pass so it never clips into walls.
const viewScene = new THREE.Scene();
const viewFill = new THREE.HemisphereLight(VIEWMODEL.fillSky, VIEWMODEL.fillGround, VIEWMODEL.fill);
viewScene.add(viewFill);
const viewSun = new THREE.DirectionalLight(VIEWMODEL.rimColor, VIEWMODEL.rim); // warm practical-light rim
viewSun.position.set(-1, 1, 2);
viewScene.add(viewSun);

const paint = new PaintSystem();
const drips = new PaintDrips(paint);
const level = new Level(scene, paint);
const lighting = new Lighting(scene, renderer);
const baker = new LightBaker();
baker.onDecorBaked = (geo) => level.pushBaked(geo);
const lightFx = new LightFX(scene);
const rain = new Rain(scene);
const heightmap = new Heightmap();
const atmosphere = new Atmosphere(sky, lighting);
const playerLight = new PlayerLight(scene);
const smoke = new Smoke(scene);
const lightning = new Lightning();
lightning.onThunder = (d) => audio.thunder(d);
live.strikeLightning = () => lightning.strike();
level.onChange = () => {
  baker.sync(level.builtProps);
  smoke.rebuild(level.emitters);
  lighting.setAnchors(level.lights);
  lightFx.rebuild(level.lights);
  heightmap.rebuild(level.colliders, level.totalBounds());
  rain.setHeightmap(heightmap);
};
/** Drawing-buffer height: glow and smoke sprites are sized in its pixels. */
let viewHeight = 1;
function syncViewSize() {
  viewHeight = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
}
syncViewSize();
let skyline = new THREE.Group();

const input = new Input(renderer.domElement);
const audio = new Audio();
const hud = new Hud();
const player = new Player(level.colliders, level.ladders);
const inventory = new Inventory();
const hotbar = new Hotbar(new Thumbnails(renderer));
const tools = new Tools(scene, viewScene, paint, level.solids, audio, inventory, level);
tools.ladder.onBlocked = () => hotbar.toast("The ladder can't stand there");
const wallHand = new WallHand(level.solids);
viewScene.add(wallHand.group);
const pickups = new Pickups(scene);
pickups.onCollect = (label) => {
  audio.pickup();
  hotbar.toast(`+ ${label}`);
};
pickups.onBlocked = (msg) => hotbar.toast(msg);
const build = new BuildMode(scene, level, pickups, player);
const debug = new DebugPanel();
live.rebuildLights = () => lightFx.rebuild(level.lights);
// Props with lights (light props, billboards) are rebuilt for a new lens color or aim; their paint carries over.
live.rebuildLightProps = () => level.rebuildLit();
live.syncAtmosphere = () => atmosphere.syncColors();
live.applyDaylight = () => atmosphere.reapplyDaylight();
live.atmosNight = () => atmosphere.nightValues;
live.applyPixelScale = () => {
  renderer.setPixelRatio(1 / RENDER.pixelScale);
  syncViewSize();
};

function loadLevel(data: LevelData) {
  drips.clear();
  level.load(data);
  pickups.load(data.pickups as PickupData[] | undefined);
  inventory.reset();
  skylineSettings = (data.skyline as SkylineSettings | undefined) ?? {};
  rebuildCity();
  player.setSpawn(new THREE.Vector3(...data.spawn.pos), data.spawn.yaw);
}

/** The city around the level, from SKYLINE + the level's own `skyline` overrides. */
let skylineSettings: SkylineSettings = {};
function rebuildCity() {
  scene.remove(skyline);
  disposeSkyline(skyline);
  skyline = buildSkyline(level.totalBounds(), skylineSettings);
  scene.add(skyline);
}
live.rebuildCity = rebuildCity;
live.rebuildSponge = () => {
  tools.sponge.model.build();
  pickups.restyle('sponge');
  hotbar.refreshIcon('sponge');
};
live.syncSkyline = syncSkyline;
build.onLoad = loadLevel;

const levelName = new URLSearchParams(location.search).get('level') ?? 'demo';
// Signs measure their text when they are built: wait for the sign font first.
Promise.all([fetchLevel(levelName), jpFontReady()])
  .then(([data]) => loadLevel(data))
  .catch((e) => console.error(e));

let lastStride = 0;
let textAtlasSeen = textAtlasVersion();
player.onLand = (speed) => audio.footstep(speed > PLAYER.hardLanding);

// Losing pointer lock (Esc, alt-tab, a file dialog) pauses the game behind the menu.
input.onLockChange = (locked) => {
  hud.setLocked(locked, debug.visible);
  if (locked) {
    settings.applyPending();
    audio.start();
  } else {
    audio.setHiss(0, 0);
    audio.setScribble(0);
  }
};
hud.onResume = () => input.requestLock();
hud.onExitFullscreen = () => void exitGameFullscreen();
hud.setLocked(false);
hud.setSettings(settings.sections());
tools.onCapChange = (name) => hud.showCapTag(name);
tools.onColorChange = (color) => hud.showColorTag(color, COLORS[color]);
// The wheel changed the marker's nib or the sponge's patch: the F3 slider follows it.
tools.onNibChange = () => debug.visible && debug.sync();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  syncViewSize();
});

const eye = new THREE.Vector3();
const timer = new THREE.Timer();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
let frameMs = 0;
let rainTime = 0;
let fov = RENDER.fov;
const tagPos = new THREE.Vector3();

function frame(time: number) {
  const t0 = performance.now();
  timer.update(time);
  const delta = timer.getDelta();
  const dt = Math.min(delta, 1 / 20);

  if (input.wasPressed('F3') || input.wasPressed('Backquote')) {
    debug.toggle();
    hud.setLocked(input.locked, debug.visible);
  }
  if (input.locked && input.wasPressed('KeyB')) {
    build.setActive(!build.active);
    atmosphere.setDaylight(build.active);
    debug.sync();
    hotbar.visible = !build.active;
    audio.setHiss(0, 0);
  }

  // Paused (pointer not locked): the world keeps rendering but nothing advances.
  const paused = !input.locked;
  if (!paused) player.update(dt, input);
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
  // Sprites follow the camera's FOV (sprinting, F3) like the world around them.
  const pointScale = viewHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
  lightFx.setPointScale(pointScale);
  smoke.setPointScale(pointScale);
  setLinePointScale(pointScale);
  sky.position.copy(eye);
  updateSkyline(skyline, eye);
  (scene.fog as THREE.FogExp2).density = ATMOS.fogDensity;
  setHex((scene.fog as THREE.FogExp2).color, INK.paper);
  syncSharedUniforms(time / 1000);
  syncTrackUniforms(eye);
  if (!paused) lightning.update(dt, ATMOS.rain && !build.active);
  lighting.update(eye, camera.matrixWorldInverse, time / 1000, lightning.flash);
  syncCityLight(lighting);
  (sky.material as THREE.ShaderMaterial).uniforms.uFlash.value = lightning.flash * THUNDER.flashSky;
  playerLight.update(eye, !build.active);
  setHex(viewFill.color, VIEWMODEL.fillSky);
  setHex(viewFill.groundColor, VIEWMODEL.fillGround);
  viewFill.intensity = VIEWMODEL.fill;
  setHex(viewSun.color, VIEWMODEL.rimColor);
  viewSun.intensity = VIEWMODEL.rim;
  lightFx.update();
  if (!paused) rainTime += dt;
  rain.update(rainTime, eye);
  smoke.update(rainTime, SMOKE.lightBase + SMOKE.lightAmbient * ATMOS.ambient + SMOKE.lightFlash * lightning.flash);
  audio.setFan(paused ? 0 : fanLevel(eye));
  if (!paused && ATMOS.rain && !build.active) metalDrops(dt, eye);
  audio.update();

  if (!paused) {
    if (build.active) build.update(input, camera);
    tools.update(dt, input, camera, eye, player, !build.active);
    wallHand.update(dt, camera, eye, !build.active, tools.spray.model.sway);
    drips.update(dt);
    pickups.update(dt, player.position, inventory);
  } else if (!build.active) tools.holdStill(camera);
  const tool = build.active ? null : inventory.tool;
  hud.setCrosshair(tools.crosshair(tool));
  const anchor = tools.labelAnchor(tagPos);
  const pressure = tool === 'can' ? inventory.pressure : null;
  hud.placeToolTags(anchor ? toScreen(anchor) : null, pressure, pressure !== null && pressure < PRESSURE.sputterThreshold);
  // A lettering atlas grew or started over: the signs ask for their rects again.
  if (textAtlasVersion() !== textAtlasSeen) {
    textAtlasSeen = textAtlasVersion();
    level.rebuildLettered();
  }
  level.flush();
  baker.update(time / 1000, eye);
  paint.flush(renderer);
  hotbar.update(inventory);
  hud.update();

  gpuTimer.enabled = debug.visible;
  post.render(scene, viewScene, camera, lighting, !build.active);
  // Same frame as the render: the canvas still holds it (see screenshot.ts).
  if (input.wasPressed('KeyK')) saveScreenshot(renderer.domElement, () => hotbar.toast('Screenshot saved'));
  gpuTimer.poll();
  const { calls, triangles } = post.sceneStats;

  input.endFrame();

  fpsFrames++;
  fpsTime += delta; // real time: dt is clamped, which would overstate fps below 20
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }
  Object.assign(live.stats, {
    fps,
    frameMs,
    drawCalls: calls,
    triangles,
    textures: paint.textureCount,
    textureBytes: paint.textureBytes,
    surfaces: paint.surfaces.length,
    uploads: paint.uploadsLastFrame,
    uploadBytes: paint.uploadBytesLastFrame,
    particles: tools.spray.particles.count,
    drips: drips.count,
    lights: lighting.active,
    bakedBytes: baker.stats.textureBytes,
    bakePending: baker.stats.pending,
    bakeMs: baker.stats.ms,
  });
  live.player = { position: player.position, velocity: player.velocity, state: player.fly ? 'flying' : player.onLadder ? 'on ladder' : player.crouched ? 'crouched' : player.onGround ? 'grounded' : 'airborne' };
  hud.setPerf({ fps, frameMs, calls, triangles, textureBytes: paint.textureBytes + baker.stats.textureBytes + staticTextureBytes() });
  debug.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const toDrop = new THREE.Vector3();
const camRight = new THREE.Vector3();
/** Raindrops pinging on nearby metal tops that are open to the sky (not under a roof). */
function metalDrops(dt: number, at: THREE.Vector3) {
  const range = AUDIO.metalRange;
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  const rate = AUDIO.metalRate * ATMOS.rainDensity * dt;
  let n = 0;
  for (const e of level.emitters) {
    if (e.kind !== 'metal') continue;
    const d = e.pos.distanceTo(at);
    if (d > range || Math.random() > rate) continue;
    if (heightmap.heightAt(e.pos.x, e.pos.z) > e.pos.y + 0.1) continue; // sheltered
    toDrop.subVectors(e.pos, at).normalize();
    const k = 1 - d / range;
    audio.drop(toDrop.dot(camRight) * 0.8, k * k);
    if (++n >= 4) break;
  }
}

/** Loudness of the nearest AC fan from its distance (0 beyond AUDIO.fanRange). */
function fanLevel(at: THREE.Vector3) {
  let best = Infinity;
  for (const e of level.emitters) if (e.kind === 'fan') best = Math.min(best, e.pos.distanceTo(at));
  const k = 1 - best / AUDIO.fanRange;
  return k > 0 ? k * k : 0;
}

function toScreen(p: THREE.Vector3) {
  p.project(camera);
  return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (0.5 - p.y * 0.5) * window.innerHeight };
}

// Handy for debugging in the console.
Object.assign(window, { game: { city: () => skyline, config, lightning, smoke, audio, wallHand, drips, lightFx, lighting, baker, player, tools, atmosphere, inventory, pickups, paint, level, build, renderer, input, hud, debug, live, PLAYER, loadLevel } });
