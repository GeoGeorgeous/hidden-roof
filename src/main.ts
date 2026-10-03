import * as THREE from 'three';
import { PLAYER, RENDER } from './config';
import { Input } from './input';
import { Player } from './player';
import { PaintSystem } from './painting';
import { World } from './world';
import { buildLevel1 } from './level1';
import { SprayCan } from './spraycan';
import { Audio } from './audio';
import { Hud } from './hud';

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1 / RENDER.pixelScale);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(RENDER.fov, window.innerWidth / window.innerHeight, 0.05, 2000);
scene.add(camera);

// The can is drawn in a second pass so it never clips into walls.
const viewScene = new THREE.Scene();
viewScene.add(new THREE.HemisphereLight('#ffe9d0', '#6a6f90', 2.2));
const viewSun = new THREE.DirectionalLight('#fff0dd', 1.6);
viewSun.position.set(-1, 2, 1);
viewScene.add(viewSun);

const paint = new PaintSystem();
const world = new World(scene, paint);
buildLevel1(world);

const input = new Input(renderer.domElement);
const audio = new Audio();
const hud = new Hud();
const player = new Player(world.colliders, world.ladders);
player.setSpawn(world.spawn, world.spawnYaw);
const can = new SprayCan(scene, paint, world.solids, audio);
viewScene.add(can.viewModel);

let lastStride = 0;
player.onLand = (speed) => audio.footstep(speed > 6);

input.onLockChange = (locked) => {
  hud.setLocked(locked);
  if (locked) audio.start();
};
hud.setLocked(false);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const eye = new THREE.Vector3();
const timer = new THREE.Timer();
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
let frameMs = 0;

function frame(time: number) {
  const t0 = performance.now();
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 20);

  if (input.wasPressed('F3') || input.wasPressed('Backquote')) hud.toggleDebug();

  if (input.locked) player.update(dt, input);
  if (player.onGround && player.stride - lastStride > 1.7) {
    lastStride = player.stride;
    audio.footstep();
  }

  player.eye(eye);
  camera.position.copy(eye);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  world.sky.position.copy(eye);

  can.update(dt, input, camera, eye);
  paint.flush();
  hud.update(can.cap.name, can.pressure);

  renderer.clear();
  renderer.render(scene, camera);
  const calls = renderer.info.render.calls;
  renderer.clearDepth();
  renderer.render(viewScene, camera);

  input.endFrame();

  fpsFrames++;
  fpsTime += dt;
  frameMs = frameMs * 0.9 + (performance.now() - t0) * 0.1;
  if (fpsTime >= 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }
  hud.updateDebug({
    fps,
    frameMs,
    textures: paint.textureCount,
    textureBytes: paint.textureBytes,
    surfaces: paint.surfaces.length,
    uploads: paint.uploadsLastFrame,
    uploadBytes: paint.uploadBytesLastFrame,
    drawCalls: calls,
    particles: can.particleCount,
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging in the console.
Object.assign(window, { game: { player, can, paint, world, renderer, input, hud, PLAYER } });
