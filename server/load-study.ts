import './headless';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import Ws from 'ws';
import { NET, PAINT_DETAIL } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import { encodeOps, SurfaceIndex } from '../src/op-wire';
import { encode, PROTOCOL, SNAPSHOT_BYTES } from '../src/net/protocol';

// One public session's load as its players grow (docs/ideas/weak-links.md): bots join the roof at ULTRA from
// addresses of their own and send their state NET.sendRate times a second as a game does; a share of them paint, a
// batch of stamps with each state. Measured over a window: the server's CPU and memory, the bots' app ping, bytes and
// frames each way, by message type. The bots run in worker processes, so they don't hold up each other's pings.
// Not part of npm run check: npm run study:load [players ...] (PAINTERS share, OPS a painter's stamps a second).

type Plan = { port: number; code: string; bots: { name: string; ip: string; paints: boolean }[]; ops: number; seconds: number };
type Report = { welcomed: number; down: Record<string, number>; frames: number; up: number; upFrames: number; pings: number[]; closed: number };

const level = JSON.parse(fs.readFileSync('public/levels/roof.json', 'utf8'));
const faces = levelPaintFaces(level, PAINT_DETAIL.ultra);
const surfaces = new SurfaceIndex(faces.map((f) => f.key));

/** A worker's bots: joined, then a game's sends for `seconds`; what they got, by the header's type. */
async function bots(plan: Plan): Promise<Report> {
  const r: Report = { welcomed: 0, down: {}, frames: 0, up: 0, upFrames: 0, pings: [], closed: 0 };
  let measuring = false;
  const got = (type: string, n: number) => void (measuring && (r.down[type] = (r.down[type] ?? 0) + n));
  const games = plan.bots.map((b, i) => {
    const ws = new Ws(`ws://localhost:${plan.port}/ws`, { headers: { 'x-forwarded-for': b.ip }, perMessageDeflate: false });
    const sent: Map<number, number> = new Map();
    let welcome: () => void;
    const welcomed = new Promise<void>((done) => (welcome = done));
    ws.on('message', (d: Buffer) => {
      const head = d.readUInt32LE(0);
      const type = /"type":"(\w+)"/.exec(d.toString('latin1', 4, 4 + Math.min(head, 64)))?.[1] ?? '?';
      if (measuring) r.frames++;
      // A relay frame's bytes by its entries (protocol.ts relayEntry), its head as other.
      if (type === 'relay') {
        let o = 4 + head;
        got('other', o);
        for (let n; o + 9 <= d.length; o += 9 + n) got(d[o] ? 'ops' : 'state', 9 + (n = d.readUInt32LE(o + 5)));
      } else got(type, d.length);
      if (type === 'welcome') welcome();
      if (type === 'pong') {
        const t = Number(/"t":(\d+)/.exec(d.toString('latin1', 4, 4 + head))?.[1]);
        if (measuring && sent.has(t)) r.pings.push(performance.now() - sent.get(t)!);
      }
    });
    ws.on('close', () => r.closed++);
    ws.on('open', () => ws.send(encode({ type: 'join', protocol: PROTOCOL, name: b.name, code: plan.code })));
    const send = (f: Uint8Array) => {
      if (ws.readyState !== Ws.OPEN) return;
      ws.send(f);
      if (measuring) (r.up += f.length), r.upFrames++;
    };
    let seq = 0;
    let pings = 0;
    const state = encode({ type: 'state', bytes: new Uint8Array(SNAPSHOT_BYTES) });
    const tick = () => {
      send(state);
      if (!b.paints) return;
      // A stroke moving across one face, as a can's stamps do.
      const face = faces[(i * 7919 + seq) % faces.length];
      const n = Math.round(plan.ops / NET.sendRate);
      const ops = Array.from({ length: n }, (_, k) => ({ kind: 'stamp' as const, key: face.key, rect: 0, u: ((seq * n + k) % 100) / 100, v: (i % 10) / 10 + 0.05, radius: 0.15, amount: 1, color: [1, 0, 0] as const, softness: 0.5, square: false }));
      send(encode({ type: 'ops', seq: ++seq, bytes: encodeOps(ops.map(() => 0), ops, surfaces) }));
    };
    return { ws, welcomed, sent, tick, ping: () => (sent.set(++pings, performance.now()), send(encode({ type: 'ping', t: pings }))) };
  });
  await Promise.race([Promise.all(games.map((g) => g.welcomed.then(() => r.welcomed++))), sleep(60000)]);
  // The games' ticks spread over the interval, as players' clocks are.
  const every = 1000 / NET.sendRate;
  const timers = games.map((g, i) => setTimeout(() => timers.push(setInterval(g.tick, every)), (i * every) / games.length));
  const pinging = setInterval(() => games.forEach((g) => g.ping()), 1000);
  await sleep(3000);
  measuring = true;
  await sleep(plan.seconds * 1000);
  measuring = false;
  timers.forEach(clearTimeout);
  clearInterval(pinging);
  games.forEach((g) => g.ws.terminate());
  return r;
}

if (process.argv[2] === 'bots') {
  process.once('message', async (plan: Plan) => process.send!(await bots(plan), () => process.exit(0)));
} else {
  const free = () => new Promise<number>((done) => { const s = net.createServer().listen(0, () => { const { port } = s.address() as net.AddressInfo; s.close(() => done(port)); }); });
  /** /proc's utime + stime (s) and rss (MB) of `pid`. */
  const usage = (pid: number) => {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return { cpu: (Number(stat[11]) + Number(stat[12])) / 100, rss: Number(/VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))![1]) / 1024 };
  };
  const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN);
  const counts = (process.argv.slice(2).map(Number).filter(Boolean).length ? process.argv.slice(2).map(Number) : [20, 40, 60, 80]);
  const share = Number(process.env.PAINTERS ?? 0.25);
  const ops = Number(process.env.OPS ?? 140);
  const seconds = Number(process.env.SECONDS ?? 20);
  const workers = Math.min(4, Number(process.env.WORKERS ?? 4));
  console.log(`roof ULTRA, ${share * 100}% painting at ${ops} stamps/s each, ${seconds} s a run, ${workers} bot processes`);
  console.log('players | server CPU | rss MB | ping p50/p99/max ms | down per player KB/s (state / ops / other) | frames per player/s | server out MB/s | up per player KB/s | welcomed | closed');
  for (const n of counts) {
    const [port, adminPort] = [await free(), await free()];
    const server: ChildProcess = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(port), ADMIN_PORT: String(adminPort), ADMIN_KEY: 'k', PUBLIC_PLAYERS: String(n) }, stdio: ['ignore', 'ignore', 'inherit'] });
    await sleep(1500);
    const made = await (await fetch(`http://localhost:${adminPort}/sessions`, { method: 'POST', headers: { authorization: 'Bearer k' }, body: JSON.stringify({ kind: 'public', name: 'Load', level: 'roof', detail: 'ultra' }) })).json();
    const names = Array.from({ length: n }, (_, i) => ({ name: `bot${i}`, ip: `10.${8 + (i >> 8)}.${i & 255}.1`, paints: i < Math.round(n * share) }));
    const plans = Array.from({ length: workers }, (_, w) => ({ port, code: made.code, bots: names.filter((_, i) => i % workers === w), ops, seconds }));
    const before = { at: performance.now(), u: usage(server.pid!) };
    let peak = 0;
    const sampling = setInterval(() => (peak = Math.max(peak, usage(server.pid!).rss)), 500);
    const reports = await Promise.all(plans.map((plan) => new Promise<Report>((done) => {
      const child = fork(process.argv[1], ['bots']);
      child.once('message', (m) => done(m as Report));
      child.send(plan);
    })));
    clearInterval(sampling);
    const after = { at: performance.now(), u: usage(server.pid!) };
    server.kill();
    const down: Record<string, number> = {};
    for (const r of reports) for (const [t, b] of Object.entries(r.down)) down[t] = (down[t] ?? 0) + b;
    const per = (b: number) => (b / seconds / n / 1024).toFixed(1);
    const of = (t: string) => down[t] ?? 0;
    const all = Object.values(down).reduce((s, b) => s + b, 0);
    const frames = reports.reduce((s, r) => s + r.frames, 0);
    const pings = reports.flatMap((r) => r.pings);
    // CPU over the whole run (joins and the measured window): the window's share is close to it once joins are done.
    const cpu = (after.u.cpu - before.u.cpu) / ((after.at - before.at) / 1000);
    console.log([n, `${(cpu * 100).toFixed(0)}%`, peak.toFixed(0), `${pct(pings, 0.5).toFixed(0)}/${pct(pings, 0.99).toFixed(0)}/${Math.max(...pings).toFixed(0)}`,
      `${per(all)} (${per(of('state'))} / ${per(of('ops'))} / ${per(all - of('state') - of('ops'))})`, (frames / seconds / n).toFixed(0), (all / seconds / 1024 / 1024).toFixed(2),
      per(reports.reduce((s, r) => s + r.up, 0)), reports.reduce((s, r) => s + r.welcomed, 0), reports.reduce((s, r) => s + r.closed, 0)].join(' | '));
  }
}
