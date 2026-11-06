// The caps on the page about the game: each cap's pickup as the game draws it, its model (bigger, over its glow), ring and glow
// on the black of the page, with its tag by the game's own PickupLabels, as public/about/caps/<id>.webp. BANANA is every player's
// from the start, so it says CAP, not NEW CAP. Run it when a cap or the pickups' look changes: npm run cap-pictures
import fs from 'node:fs';
import { openTestBrowser } from './test-browser.mjs';

const WIDTH = 320;
const HEIGHT = 220;
const SCALE = 1.5;
/** The cap against its pickup's size: this small on a page, it has to read. */
const BIGGER = 1.8;
const test = await openTestBrowser(undefined, { level: null });
const context = await test.browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });
const page = await context.newPage();
await page.goto(test.url.split('?')[0]);
// The page's own modules, from the Vite server.
const modules = ['/node_modules/.vite/deps/three.js', '/src/pickups/visuals.ts', '/src/pickups/labels.ts', '/src/config.ts', '/src/style.css'];
const caps = await page.evaluate(async ({ modules, width, height, bigger }) => {
  const [THREE, { itemModel, halo, setRing, glow, setGlow }, { PickupLabels }, { PICKUP, CAP_ORDER }] = await Promise.all(modules.map((m) => import(m)));
  document.documentElement.classList.add('game');
  document.body.replaceChildren();
  const canvas = document.createElement('canvas');
  const world = Object.assign(document.createElement('div'), { className: 'layer-world' });
  canvas.style.cssText = world.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden';
  document.body.append(canvas, world);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height, false);
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 10);
  camera.position.set(0, PICKUP.hover + 0.05, 2.1);
  camera.lookAt(0, PICKUP.hover + 0.05, 0);
  camera.updateMatrixWorld();
  const labels = new PickupLabels(camera, { near: () => {} });
  let next = 1;
  window.shoot = async (id) => {
    const kind = `cap:${id}`;
    const scene = new THREE.Scene();
    const pose = new THREE.Group();
    pose.add(itemModel(kind));
    pose.scale.setScalar(PICKUP.models.cap.size * bigger);
    pose.position.y = PICKUP.hover;
    // The nozzle in sight, in front of the cap.
    pose.rotation.y = Math.PI + 0.6;
    const light = glow(kind);
    light.light.position.y = PICKUP.hover;
    light.light.scale.setScalar(PICKUP.glow.size);
    setGlow(light, PICKUP.glow.strength);
    const ring = halo(kind);
    ring.position.y = PICKUP.hover;
    ring.scale.setScalar(PICKUP.ring.size);
    setRing(ring, kind);
    // The cap over its glow, in its own color: the game's glow washes it out at this size.
    const cap = new THREE.Scene();
    cap.add(pose);
    scene.add(light.light, ring);
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(cap, camera);
    const pickup = { id: next++, kind, pos: [0, 0, 0], group: { visible: true }, halo: ring };
    labels.update(1, [pickup], () => id !== 'standard');
    await document.fonts.ready;
    return pickup.id;
  };
  window.forget = (n) => labels.remove(n);
  return CAP_ORDER;
}, { modules, width: WIDTH, height: HEIGHT, bigger: BIGGER });

fs.mkdirSync('public/about/caps', { recursive: true });
const encoder = await context.newPage();
for (const id of caps) {
  const shown = await page.evaluate((id) => window.shoot(id), id);
  await page.waitForTimeout(500);
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
  fs.writeFileSync(`public/about/caps/${id}.webp`, Buffer.from(webp.split(',')[1], 'base64'));
}
await test.close();
console.log(`caps: ${caps.length} pictures in public/about/caps`);
