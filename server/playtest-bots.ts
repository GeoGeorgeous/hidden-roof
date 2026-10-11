import './headless';
import fs from 'node:fs';
import { CAP_ORDER, PAINT, PLAYTEST } from '../src/config';
import { levelPaintFaces } from '../src/level/prop-pieces';
import type { LevelData } from '../src/level/level';
import { decode, encode, PROTOCOL, SNAPSHOT_BYTES, type ToClient, type ToServer } from '../src/net/protocol';
import { surfaceTable } from '../src/save/shape';

// Bots for the playtest's dry run (docs/playtest.md): players that host or join
// one session, walk in circles near the spawn, and spray nonstop (state 20 times
// a second, paint ops as a spraying player sends them, a ping every 2 s, a
// report every 5 s), to load the server before real players do. They draw
// nothing: their numbers are the server's and the link's only.
// Usage: npm run playtest:bots -- <ws url> [players] [minutes] [level]
//   e.g. npm run playtest:bots -- ws://localhost:3000/ws 8 5

const [url = 'ws://localhost:3000/ws', players = '8', minutes = '5', levelName = 'roof'] = process.argv.slice(2);
const level = JSON.parse(fs.readFileSync(`public/levels/${levelName}.json`, 'utf8')) as LevelData;
const DETAIL = 48;
PAINT.texelsPerMeter = DETAIL;
const faces = levelPaintFaces(level);
const table = surfaceTable(faces);
const local = /localhost|127\.0\.0\.1/.test(url);
const end = Date.now() + Number(minutes) * 60_000;

interface Numbers {
  pings: number[];
  inMsgs: number;
  inBytes: number;
  longestSilence: number;
}

class Bot {
  ws: WebSocket;
  code = '';
  n: Numbers = { pings: [], inMsgs: 0, inBytes: 0, longestSilence: 0 };
  private heard = 0;
  private t0 = performance.now();
  private angle = Math.random() * Math.PI * 2;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    readonly index: number,
    hello: ToServer,
    onWelcome: (code: string) => void,
  ) {
    // Locally each bot comes from its own address (the server's limits are per address); through Caddy the header is Caddy's to set.
    const headers = local ? { 'x-forwarded-for': `10.9.0.${index + 1}` } : {};
    this.ws = new WebSocket(url + (hello.type === 'host' ? '?host' : ''), { headers } as unknown as string[]);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.ws.send(encode(hello));
    this.ws.onmessage = (e) => {
      const now = performance.now();
      if (this.heard) this.n.longestSilence = Math.max(this.n.longestSilence, now - this.heard);
      this.heard = now;
      this.n.inMsgs++;
      this.n.inBytes += (e.data as ArrayBuffer).byteLength;
      const m = decode(new Uint8Array(e.data as ArrayBuffer)) as ToClient | null;
      if (m?.type === 'welcome') {
        this.code = m.code;
        onWelcome(m.code);
        this.play();
      } else if (m?.type === 'pong') this.n.pings.push(performance.now() - m.t * 1000);
      else if (m?.type === 'rejected') console.log(`bot ${index}: turned away: ${m.reason}`);
    };
    this.ws.onclose = (e) => {
      this.timers.forEach(clearInterval);
      if (Date.now() < end) console.log(`bot ${index}: closed ${e.code} ${e.reason}`);
    };
  }

  private send(m: ToServer) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(m));
  }

  private play() {
    const spawn = level.spawn.pos;
    this.timers.push(
      setInterval(() => {
        this.angle += 0.05;
        const t = (performance.now() - this.t0) / 1000;
        const b = new Uint8Array(SNAPSHOT_BYTES);
        const v = new DataView(b.buffer);
        v.setFloat32(0, t, true);
        v.setFloat32(4, spawn[0] + Math.cos(this.angle) * 3, true);
        v.setFloat32(8, spawn[1], true);
        v.setFloat32(12, spawn[2] + Math.sin(this.angle) * 3, true);
        b[20] = 1;
        // The can (slot 1), spraying (action 1), a color and cap, full flow.
        b[21] = 1 | (1 << 3);
        b[22] = this.index % 6;
        b[23] = this.index % CAP_ORDER.length;
        b[24] = 255;
        this.send({ type: 'state', bytes: b });
        const ops = Array.from({ length: 3 }, () => {
          const f = faces[Math.floor(Math.random() * faces.length)];
          return { kind: 'stamp' as const, key: f.key, rect: Math.floor(Math.random() * f.geo.rects.length), u: Math.random(), v: Math.random(), radius: 0.02, amount: 0.35, color: [Math.random(), Math.random(), Math.random()] as [number, number, number], softness: 0.5, square: false };
        });
        this.send({ type: 'ops', t: ops.map(() => t), ops });
      }, 50),
      setInterval(() => this.send({ type: 'ping', t: performance.now() / 1000 }), 2000),
      setInterval(() => this.send({ type: 'stats', data: { kind: 'window', device: `bot-${this.index}`, load: 'bot', bot: true } }), PLAYTEST.every * 1000),
    );
  }

  close() {
    this.send({ type: 'leave' });
    this.ws.close();
  }
}

const bots: Bot[] = [];
const join = (code: string) => {
  for (let i = 1; i < Number(players); i++) bots.push(new Bot(i, { type: 'join', protocol: PROTOCOL, name: `bot ${i}`, code }, () => {}));
};
console.log(`${players} bots on ${url}, ${levelName} at ${DETAIL} texels/m, for ${minutes} min`);
bots.push(new Bot(0, { type: 'host', protocol: PROTOCOL, table, name: 'bot 0', levelName, level, detail: DETAIL }, (code) => (console.log(`session ${code}`), join(code))));

const pct = (xs: number[], p: number) => (xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]) : '–');
const report = setInterval(() => {
  const pings = bots.flatMap((b) => b.n.pings);
  const inMsgs = bots.reduce((n, b) => n + b.n.inMsgs, 0);
  const inKB = bots.reduce((n, b) => n + b.n.inBytes, 0) / 1024;
  const silence = Math.max(...bots.map((b) => b.n.longestSilence));
  console.log(`${bots.filter((b) => b.code).length} in · ping p50 ${pct(pings, 0.5)} p95 ${pct(pings, 0.95)} max ${pct(pings, 1)} ms · down ${(inMsgs / 5).toFixed(0)} msgs/s, ${(inKB / 5).toFixed(0)} KB/s in all · longest silence ${Math.round(silence)} ms`);
  for (const b of bots) b.n = { pings: [], inMsgs: 0, inBytes: 0, longestSilence: 0 };
  if (Date.now() > end) {
    clearInterval(report);
    bots.forEach((b) => b.close());
    setTimeout(() => process.exit(0), 500);
  }
}, 5000);
