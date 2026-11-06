// The caps and tools on the page about the game: each one's pickup as the game draws it, its model and ring (light,
// see-through, no glow: on the black of the page a dark ring is lost), with its tag by the game's own PickupLabels, as
// public/about/pickups/<id>.webp. BANANA is every player's from the start, so it says CAP, not NEW CAP. Run it when a
// cap, a tool or the pickups' look changes: npm run pickup-pictures
import fs from 'node:fs';
import { openTestBrowser } from './test-browser.mjs';

const SCALE = 2;
/** Picture px per meter at the pickup, and the camera's way from it (m). */
const PER_METER = 144;
const AWAY = 2.1;
/** The light ring, a little see-through. */
const RING_OPACITY = 0.7;
/**
 * Each kind's picture: its size (px), cropped to the pickup and its longest tag so it lines up with the text under it;
 * the camera `side` and `up` from the pickup (m); how much `bigger` than its pickup the model is, to read this small.
 */
const FRAMES = [
  { ids: ['needle', 'skinny', 'standard', 'soft', 'fat', 'spray'], kind: (id) => `cap:${id}`, width: 240, height: 160, side: 0.166, up: 0.015, bigger: 1.8 },
  { ids: ['marker', 'roller', 'sponge', 'ladder'], kind: (id) => id, width: 200, height: 200, side: 0.118, up: 0, bigger: 1 },
];

const test = await openTestBrowser(undefined, { level: null });
const context = await test.browser.newContext({ viewport: { width: 240, height: 200 }, deviceScaleFactor: SCALE });
const page = await context.newPage();
await page.goto(test.url.split('?')[0]);
// The page's own modules, from the Vite server.
const modules = ['/node_modules/.vite/deps/three.js', '/src/pickups/visuals.ts', '/src/pickups/labels.ts', '/src/config.ts', '/src/style.css'];
await page.evaluate(async ({ modules, perMeter, away, ringOpacity }) => {
  const [THREE, { itemModel, halo }, { PickupLabels }, { PICKUP, INK }] = await Promise.all(modules.map((m) => import(m)));
  document.documentElement.classList.add('game');
  document.body.replaceChildren();
  const canvas = document.createElement('canvas');
  const world = Object.assign(document.createElement('div'), { className: 'layer-world' });
  canvas.style.cssText = world.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden';
  document.body.append(canvas, world);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio);
  const camera = new THREE.PerspectiveCamera();
  const labels = new PickupLabels(camera, { near: () => {} });
  let next = 1;
  window.shoot = async (id, kind, { width, height, side, up, bigger }) => {
    renderer.setSize(width, height, false);
    camera.fov = (2 * Math.atan(height / (2 * away * perMeter)) * 180) / Math.PI;
    camera.aspect = width / height;
    camera.position.set(side, PICKUP.hover + up, away);
    camera.lookAt(side, PICKUP.hover + up, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const pose = new THREE.Group();
    pose.add(itemModel(kind));
    pose.scale.setScalar(PICKUP.models[kind.startsWith('cap:') ? 'cap' : kind].size * bigger);
    pose.position.y = PICKUP.hover;
    // The front in sight: a cap's nozzle in front of it.
    pose.rotation.y = Math.PI + 0.6;
    const ring = halo(kind);
    ring.position.y = PICKUP.hover;
    ring.scale.setScalar(PICKUP.ring.size);
    ring.material.color.set(INK.paper);
    ring.material.opacity = ringOpacity;
    // The model over its ring, whole.
    const scene = new THREE.Scene();
    scene.add(ring);
    const model = new THREE.Scene();
    model.add(pose);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(model, camera);
    const pickup = { id: next++, kind, pos: [0, 0, 0], group: { visible: true }, halo: ring };
    labels.update(1, [pickup], () => id !== 'standard');
    await document.fonts.ready;
    return pickup.id;
  };
  window.forget = (n) => labels.remove(n);
}, { modules, perMeter: PER_METER, away: AWAY, ringOpacity: RING_OPACITY });

fs.mkdirSync('public/about/pickups', { recursive: true });
const encoder = await context.newPage();
let made = 0;
for (const { ids, kind, ...frame } of FRAMES) {
  await page.setViewportSize({ width: frame.width, height: frame.height });
  for (const id of ids) {
    const shown = await page.evaluate(([id, kind, frame]) => window.shoot(id, kind, frame), [id, kind(id), frame]);
    await page.waitForTimeout(500);
    // A tag cut off by the crop is a wrong FRAMES.
    const cut = await page.evaluate(() => [...document.querySelectorAll('.pickup-tag span')].some((el) => {
      const r = el.getBoundingClientRect();
      return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight;
    }));
    if (cut) throw new Error(`${id}: its tag doesn't fit the picture`);
    const png = await page.screenshot();
    await page.evaluate((n) => window.forget(n), shown);
    const webp = await encoder.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas.toDataURL('image/webp', 0.85);
    }, `data:image/png;base64,${png.toString('base64')}`);
    fs.writeFileSync(`public/about/pickups/${id}.webp`, Buffer.from(webp.split(',')[1], 'base64'));
    made++;
  }
}
await test.close();
console.log(`pickups: ${made} pictures in public/about/pickups`);
