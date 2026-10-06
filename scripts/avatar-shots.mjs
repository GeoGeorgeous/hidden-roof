// Screenshots of the avatar test figure (F3 -> Avatar) for review: each pose
// from a chosen angle in plain daylight, a few at night in the level's own
// light, and a contact sheet of them all. Writes shots/avatar/*.png and
// shots/avatar/sheet.png. Slow (SwiftShader draws on the CPU): about a minute.
// Usage: node scripts/avatar-shots.mjs [url]   (no url: starts its own server;
// ONLY=walk,shake takes only those shots)
import fs from 'node:fs';
import { gameReady, openTestBrowser } from './test-browser.mjs';

const OUT = 'shots/avatar';
const W = 800;
const H = 600;
/** [file, pose, angle around the figure (deg, 0 = its front, 90 = its left), distance (m), eye height (m), daylight, hood up, height looked at (m)] */
const SHOTS = [
  ['idle-front', 'idle', 0, 1.7, 1.2, true],
  ['idle-three-quarter', 'idle', 35, 2.0, 1.3, true],
  ['idle-back', 'idle', 160, 2.0, 1.3, true],
  ['hood-up', 'idle', 25, 1.7, 1.5, true, true],
  ['walk', 'walk', 70, 2.3, 1.2, true],
  ['sprint', 'sprint', 90, 2.5, 1.2, true],
  ['crouch', 'crouch', 50, 2.0, 1.1, true],
  ['crouch-walk', 'crouch walk', 90, 2.2, 1.0, true],
  ['jump', 'jump', 80, 2.3, 1.3, true],
  ['climb', 'climb', 110, 2.0, 1.4, true],
  ['holding-can', 'holding the can', -40, 1.7, 1.3, true],
  ['spray-ahead', 'spray ahead', -80, 2.2, 1.4, true],
  ['spray-up', 'spray up', -70, 2.4, 1.4, true],
  ['spray-crouched', 'crouched spraying', -70, 2.2, 1.1, true],
  ['shake', 'shake', -30, 1.7, 1.4, true],
  ['marker', 'marker', -60, 1.9, 1.4, true],
  ['roller', 'roller', -70, 2.0, 1.4, true],
  ['sponge', 'sponge', -60, 1.9, 1.4, true],
  ['carry-ladder', 'carrying the ladder', -80, 2.6, 1.3, true],
  ['hand-can', 'holding the can', -45, 1.1, 1.25, true, false, 1.0],
  ['night-idle', 'idle', 30, 2.0, 1.5, false],
  ['night-spray', 'spray ahead', -70, 2.2, 1.5, false],
];

const only = process.env.ONLY?.split(',');
const shots = only ? SHOTS.filter(([f]) => only.includes(f)) : SHOTS;
fs.mkdirSync(OUT, { recursive: true });
const test = await openTestBrowser(process.argv[2]);
const page = await test.browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(test.url);
await gameReady(page, 4);
// Only the game's view: no menu, hotbar or crosshair.
await page.addStyleTag({ content: 'body > *:not(canvas) { display: none !important; }' });
await page.evaluate(() => {
  const g = window.game;
  g.player.fly = true;
  // No first-person hands and tools.
  g.viewScene.visible = false;
  g.input.locked = true;
  g.live.avatarToggle();
  g.live.avatarNext();
});

const frames = (n) => page.evaluate((n) => new Promise((done) => { const tick = () => (--n ? requestAnimationFrame(tick) : done()); requestAnimationFrame(tick); }), n);
for (const [file, pose, angle, dist, eye, day, hood, at = 0.95] of shots) {
  await page.evaluate(({ pose, angle, dist, eye, day, hood, at }) => {
    const g = window.game;
    g.config.AVATAR.hoodUp = !!hood;
    g.live.avatarRestyle();
    for (let i = 0; i < 40 && g.live.avatarPose() !== pose; i++) g.live.avatarNext();
    g.atmosphere.setDaylight(day);
    // The figure: the first avatar in the scene.
    let fig = null;
    g.level.root.parent.traverse((o) => (fig ??= o.isSkinnedMesh ? o.parent : null));
    const c = fig.position;
    const a = fig.rotation.y + (angle * Math.PI) / 180;
    const [x, z] = [c.x - Math.sin(a) * dist, c.z - Math.cos(a) * dist];
    const yaw = Math.atan2(x - c.x, z - c.z);
    const look = at - eye;
    // Steps take the player's eye height off; fly mode keeps the position.
    g.fixedStep.dt = 0.05;
    g.fixedStep.script = () => {
      g.player.position.set(x, c.y + eye - g.config.PLAYER.eyeHeight, z);
      g.player.velocity.set(0, 0, 0);
      g.player.yaw = yaw;
      g.player.pitch = Math.atan2(look, dist);
    };
  }, { pose, angle, dist, eye, day, hood, at });
  // Long enough for the pose to settle (and walk cycles to be mid-stride).
  await frames(14);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  console.log(file);
}

// A contact sheet of every shot, with its name.
const sheet = await test.browser.newPage({ viewport: { width: 4 * 320, height: Math.ceil(SHOTS.length / 4) * 260 } });
const cells = SHOTS.map(([f]) => `<figure><img src="data:image/png;base64,${fs.readFileSync(`${OUT}/${f}.png`).toString('base64')}"><figcaption>${f}</figcaption></figure>`).join('');
await sheet.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(4,320px);background:#111;font:12px sans-serif;color:#ddd}figure{margin:0;height:260px}img{width:320px;height:240px;display:block}figcaption{padding:2px 6px}</style>${cells}`);
await sheet.screenshot({ path: `${OUT}/sheet.png`, fullPage: true });
await test.close();
console.log(`${OUT}/sheet.png`);
