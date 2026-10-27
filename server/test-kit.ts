import './headless';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { WebSocket as Ws } from 'ws';
import { PartsIn } from '../src/net/parts-in';
import { encode, PROTOCOL, received, rejectionOf, type ToClient, type ToServer } from '../src/net/protocol';

// What the tests that run the built server share (lobby-test.ts, queue-test.ts): a server on a free port, and a game
// from its own address (or the one given) that keeps what the server sends.

const freePort = () =>
  new Promise<number>((done) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => done(port));
    });
  });
/** A server on a free port, listening; `env` adds to its environment. `stop` waits for it to exit (it saves first); `out()`: what it logged. */
export async function start(env: Record<string, string>) {
  const [port, adminPort] = [await freePort(), await freePort()];
  const child = spawn(process.execPath, ['dist-server/server/main.js'], { env: { ...process.env, PORT: String(port), ADMIN_PORT: String(adminPort), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout!.on('data', (d: Buffer) => (out += d.toString()));
  // With LOG_DIR it says so in today's file instead.
  const file = env.LOG_DIR && path.join(env.LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
  const said = () => out + (file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
  for (let i = 0; !said().includes('roof server on'); i++) {
    if (i > 500) throw new Error('the server does not start');
    await new Promise((w) => setTimeout(w, 20));
  }
  return { port, adminPort, env: { ...process.env, ADMIN_PORT: String(adminPort), ...env }, out: () => out, stop: () => new Promise((done) => (child.once('exit', done), child.kill())) };
}

/** Why the server turned a game away: its link's close code, within 10 s. */
export async function rejected(g: { closed: Promise<number>; got: { type: string }[] }) {
  const late = new Promise<never>((_, no) => setTimeout(() => no(new Error(`not turned away (got ${g.got.map((m) => m.type)})`)), 10000).unref());
  return rejectionOf(await Promise.race([g.closed, late]));
}

let games = 0;
/** A game from its own address: what it got, the next message of a type, how it closed. */
export class Game {
  ws: Ws;
  got: (ToClient & { file?: Uint8Array })[] = [];
  closed: Promise<number>;
  constructor(port: number, ip = `10.2.0.${++games}`) {
    this.ws = new Ws(`ws://localhost:${port}/ws`, { headers: { 'x-forwarded-for': ip } });
    const parts = new PartsIn();
    this.ws.on('message', (d: Buffer) => {
      for (const m of received(new Uint8Array(d))) {
        const done = parts.take(m);
        if (done) this.got.push(done.m);
      }
    });
    this.closed = new Promise((done) => this.ws.once('close', done));
  }
  async send(m: ToServer) {
    if (this.ws.readyState !== Ws.OPEN) await new Promise((w) => this.ws.once('open', w));
    this.ws.send(encode(m));
    return this;
  }
  rejected() {
    return rejected(this);
  }
  async next<T extends ToClient['type']>(type: T) {
    for (const end = Date.now() + 10000; ; await new Promise((w) => setTimeout(w, 20))) {
      const i = this.got.findIndex((m) => m.type === type);
      if (i >= 0) return this.got.splice(i, 1)[0] as Extract<ToClient, { type: T }>;
      if (Date.now() > end) throw new Error(`no ${type} (got ${this.got.map((m) => m.type)})`);
    }
  }
}

/** A game that joins `code` as `name`; `more`: its token or queue token; `ip`: its address (another one of its own by default). */
export const join = (port: number, name: string, code: string, more: { token?: string; queue?: string } = {}, ip?: string) => new Game(port, ip).send({ type: 'join', protocol: PROTOCOL, name, code, ...more });
