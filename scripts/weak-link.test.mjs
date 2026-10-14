// Multiplayer on weak networks: scenarios from the playtest of 2026-10-12
// (docs/playtest-multiplayer.md) and the backlog, played back with real browsers,
// the real server and a link proxy per player (scripts/net-lab.mjs). Each prints
// what happened. Checks what works: a scenario fails when it breaks; what is still
// a bug is printed under "open", with its backlog item, until it's fixed.
// Not part of npm run check: run it for multiplayer work (~1 min a scenario).
// Usage: npm run test:weak-link                  (every scenario)
//        SCENARIO=slow,stall npm run test:weak-link
import { closeLab, hasStroke, openLab, ownSurface, paintNonstop, state, story, stroke, watch } from './net-lab.mjs';

const sleep = (s) => new Promise((done) => setTimeout(done, s * 1000));
/** A weak link (bytes a second): the playtest's weak players joined at ~70 KB/s and dropped more the more they received. */
const SLOW = { down: 8000, up: 4000 };
const narrow = (p) => (Object.assign(p.proxy.down, { rate: SLOW.down }), Object.assign(p.proxy.up, { rate: SLOW.up }));
const dropped = (lab, name, code = '') => lab.server.some((s) => new RegExp(`"${name}" #\\d+ dropped \\(${code}`).test(s.line));

const SCENARIOS = {
  /** B on a slow link for a minute while A paints, its rejoins too (BL-004 heartbeat, BL-009 DISCONNECTED, BL-003 strokes, BL-085 slow join). */
  async slow(lab, r) {
    const { A, B } = lab.players;
    const mine = await ownSurface(B, 0);
    const lost = await ownSurface(B, 1);
    const painting = await paintNonstop(A);
    narrow(B);
    await sleep(3);
    await stroke(B, mine);
    await stroke(B, lost, 'down');
    await sleep(57);
    await painting.stop();
    B.proxy.open();
    await state(B, 'in', 60000).catch(() => r.fail.push('B never got back in'));
    await sleep(3);
    const kept = async (i) => (await hasStroke(A, i)) && (await hasStroke(B, i));
    r.facts.push(`B's stroke on the slow link: ${(await kept(mine)) ? 'kept' : 'lost'}`);
    r.facts.push(`B's stroke made while its link was down: ${(await kept(lost)) ? 'kept' : 'lost'}`);
    if (!(await kept(mine))) r.fail.push("B's stroke on a slow but live link is lost");
    if (!(await kept(lost))) r.open.push('BL-003: a stroke made between the drop and the rejoin is lost');
    if (dropped(lab, 'B', 1006)) r.open.push('BL-004: the server drops B (1006) while B still sends; A shows B as DISCONNECTED meanwhile (BL-009)');
  },

  /** B's link stops dead both ways for 15 s, then comes back: the game's own close after 6 s of silence, strokes in flight. */
  async stall(lab, r) {
    const { A, B } = lab.players;
    const inFlight = await ownSurface(B, 0);
    const lost = await ownSurface(B, 1);
    const painting = await paintNonstop(A);
    await sleep(2);
    B.proxy.down.rate = B.proxy.up.rate = 0;
    await stroke(B, inFlight);
    await stroke(B, lost, 'down');
    await sleep(15);
    B.proxy.open();
    await painting.stop();
    await state(B, 'in', 60000).catch(() => r.fail.push('B never got back in'));
    await sleep(3);
    const kept = async (i) => (await hasStroke(A, i)) && (await hasStroke(B, i));
    // The proxy keeps what a dead link was sent and delivers it once it's back; a real dead link may not.
    r.facts.push(`B's stroke sent into the dead link: ${(await kept(inFlight)) ? 'kept' : 'lost'} (the proxy delivers it late; a real dead link may lose it)`);
    r.facts.push(`B's stroke made while it was reconnecting: ${(await kept(lost)) ? 'kept' : 'lost'}`);
    if (!(await kept(inFlight)) || !(await kept(lost))) r.open.push('BL-003: strokes sent into a dead link, or made before the rejoin, are lost');
  },

  /** B 1.5 s away each way (a far VPN exit) and no slower, while A paints: does anything drop? */
  async latency(lab, r) {
    const { A, B } = lab.players;
    const painting = await paintNonstop(A);
    B.proxy.down.delay = B.proxy.up.delay = 1500;
    await sleep(30);
    r.facts.push(`B's ping: ${await B.page.evaluate(() => window.game.net.stats?.ping?.toFixed(2) ?? 'n/a')} s`);
    B.proxy.open();
    await painting.stop();
    await sleep(3);
    if (dropped(lab, 'B')) r.fail.push('a slow but steady link (1.5 s each way) is dropped');
  },

  /** Three players, B on a slow link, A painting: does C, on a good one, notice anything? */
  async 'three-players'(lab, r) {
    const { A, B } = lab.players;
    const painting = await paintNonstop(A);
    narrow(B);
    await sleep(40);
    B.proxy.open();
    await painting.stop();
    await sleep(3);
    r.facts.push(`C (a good link) dropped: ${dropped(lab, 'C') ? 'yes' : 'no'}`);
    if (dropped(lab, 'C')) r.fail.push('a weak player made a good one drop');
    if (dropped(lab, 'B', 1006)) r.open.push('BL-004: the server drops B (1006) while B still sends');
  },

  /** B gone longer than the rejoin window (5 s here): back as a new player, what it carried comes back by name. */
  async 'past-rejoin-window'(lab, r) {
    const { A, B } = lab.players;
    await B.page.evaluate(() => {
      const g = window.game;
      g.inventory.give('marker');
      g.level.setRuntime(g.session.player, { type: 'stepladder', pos: [1, 0, 1], rot: 0 });
    });
    await B.page.waitForFunction(() => window.game.net.carried === window.game.inventory.version, null, { timeout: 5000 });
    await A.page.waitForFunction(() => window.game.level.runtimeOf('player2') !== undefined, null, { timeout: 10000 });
    // Dead both ways: the server notices on its heartbeat (~20 s), then the window runs out.
    B.proxy.down.rate = B.proxy.up.rate = 0;
    await sleep(35);
    B.proxy.open();
    await state(B, 'in', 60000).catch(() => r.fail.push('B never got back in'));
    await sleep(3);
    const how = lab.server.filter((s) => /"B" #\d+ in from/.test(s.line)).at(-1)?.line.match(/\((new|back|takeover)/)?.[1];
    const marker = await B.page.evaluate(() => window.game.inventory.has('marker'));
    r.facts.push(`B came back as: ${how}; still has the marker: ${marker}`);
    if (how !== 'new') r.fail.push(`B came back as ${how}, not new: the window didn't run out`);
    if (!marker) r.fail.push('what B carried is not back by name');
  },

  /** What a painter's ops cost everyone else: bytes down to B per stamp A makes (BL-024: ~250 B today, ~20 B the goal). */
  async bytes(lab, r) {
    const { A, B } = lab.players;
    await sleep(3);
    const idle = B.proxy.down.bytes;
    await sleep(5);
    const base = (B.proxy.down.bytes - idle) / 5;
    const start = B.proxy.down.bytes;
    const t = Date.now();
    const painting = await paintNonstop(A);
    await sleep(10);
    const stamps = await painting.stop();
    await sleep(2);
    const perStamp = (B.proxy.down.bytes - start - (base * (Date.now() - t)) / 1000) / stamps;
    r.facts.push(`down to B: ${base.toFixed(0)} B/s idle, ${perStamp.toFixed(0)} B per stamp A makes (${stamps} stamps)`);
    if (perStamp > 30) r.open.push(`BL-024: ${perStamp.toFixed(0)} B per paint op (the goal is ~20)`);
  },
};

const PLAYERS = { 'three-players': ['A', 'B', 'C'] };
const ENV = { 'past-rejoin-window': { REJOIN_WINDOW: '5' } };
const picked = process.env.SCENARIO ? process.env.SCENARIO.split(',') : Object.keys(SCENARIOS);
let failed = 0;
for (const name of picked) {
  const r = { facts: [], open: [], fail: [] };
  const lab = await openLab(PLAYERS[name] ?? ['A', 'B'], ENV[name]);
  const stop = watch(lab);
  try {
    await SCENARIOS[name](lab, r);
  } catch (e) {
    r.fail.push(e.message.split('\n')[0]);
  }
  stop();
  await sleep(1.5);
  console.log(`\n${r.fail.length ? 'FAIL' : 'ok  '}  ${name}`);
  for (const line of story(lab)) console.log(line);
  for (const f of r.facts) console.log(`  · ${f}`);
  for (const o of r.open) console.log(`  open: ${o}`);
  for (const f of r.fail) console.log(`  FAIL: ${f}`);
  failed += r.fail.length ? 1 : 0;
  await closeLab(lab);
}
console.log(failed ? `\nweak links: FAILED (${failed})` : '\nweak links: all ok (the open lines are known bugs)');
process.exitCode = failed ? 1 : 0;
