// The caps on the page about the game: each cap's model (tools/shapes.ts) as public/about/caps/<id>.webp, on a
// transparent ground, lit so its shape reads. Run it when a cap's look changes: npm run cap-pictures
import fs from 'node:fs';
import { openTestBrowser } from './test-browser.mjs';

const SIZE = 192;
const test = await openTestBrowser(undefined, { level: null });
const page = await test.browser.newPage();
await page.goto(test.url.split('?')[0]);
// The page's own modules, from the Vite server.
const modules = ['/node_modules/.vite/deps/three.js', '/src/tools/shapes.ts', '/src/config.ts'];
const pictures = await page.evaluate(async ({ size, modules }) => {
  const [THREE, { capShape }, { CAP_ORDER }] = await Promise.all(modules.map((m) => import(m)));
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const lit = (color) => new THREE.MeshLambertMaterial({ color });
  const look = { tone: lit, color: lit, paint: lit('#fff') };
  const half = 0.019;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 2);
  camera.position.set(0, 0.28, 0.5);
  camera.lookAt(0, 0.008, 0);
  const out = {};
  for (const id of CAP_ORDER) {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-1, 2, 2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2.2), sun);
    const { group } = capShape(id, look);
    // The nozzle toward the viewer and a little to the right, in front of the cap's body: a dark one would be lost on the page.
    group.rotation.y = Math.PI + 0.6;
    scene.add(group);
    renderer.render(scene, camera);
    out[id] = canvas.toDataURL('image/webp', 0.9);
  }
  return out;
}, { size: SIZE, modules });
fs.mkdirSync('public/about/caps', { recursive: true });
for (const [id, url] of Object.entries(pictures)) fs.writeFileSync(`public/about/caps/${id}.webp`, Buffer.from(url.split(',')[1], 'base64'));
await test.close();
console.log(`caps: ${Object.keys(pictures).length} pictures in public/about/caps`);
