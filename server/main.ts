import './headless';
import { randomInt } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER } from '../src/config';
import { checkToServer, closeCode, CODE_LENGTH, CODE_LETTERS, decode, encode, HELLO, PROTOCOL, type Rejection, type ToServer } from '../src/net/protocol';
import { liveMemory, log, who } from './log';
import { Session, type Link, type Player } from './session';
import { waiting } from './snapshot';

// The multiplayer server: WebSocket sessions at /ws (net/protocol.ts), on
// SERVER.port (or PORT). A plain GET at /ws answers HELLO (the game asks it
// when it can't connect, to tell a server that's down from a blocked socket);
// /healthz is for Docker. Caddy serves the game and passes /ws through
// (docs/deploy.md). One process, everything in memory; every event is a log line.

const sessions = new Map<string, Session>();
/** Codes of sessions that ended, and when: joining one says it has ended rather than that there's no such code. */
const ended = new Map<string, number>();
/** Open links and HOST links per address, and the address each live session was hosted from: SERVER.linksPerIp, uploadsPerIp, sessionsPerIp. */
const links = new Map<string, number>();
const uploads = new Map<string, number>();
const hosts = new Map<string, string>();
// Tests come back (and give up on a silent link) sooner than players.
SERVER.rejoinWindow = Number(process.env.REJOIN_WINDOW) || SERVER.rejoinWindow;
SERVER.helloTimeout = Number(process.env.HELLO_TIMEOUT) || SERVER.helloTimeout;
// Memory limits follow the container's (docs/deploy.md).
SERVER.hostMemory = Number(process.env.HOST_MEMORY) || SERVER.hostMemory;
SERVER.snapshotMemory = Number(process.env.SNAPSHOT_MEMORY) || SERVER.snapshotMemory;

const server = http.createServer((req, res) => {
  const path = req.url?.split('?')[0];
  const body = path === '/healthz' ? `ok, ${sessions.size} sessions\n` : path === '/ws' ? HELLO : null;
  // No caching: the game asks to learn whether the server is up now.
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(body ?? '');
});
// /ws?host takes HOST's save, up to SERVER.maxPayload, from a few links at a time; /ws only small messages, so a
// whole session from one address costs little. No compression (protocol.ts).
const hostWss = new WebSocketServer({ noServer: true, maxPayload: SERVER.maxPayload, perMessageDeflate: false });
const wss = new WebSocketServer({ noServer: true, maxPayload: SERVER.maxMessage, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', 'http://roof');
  if (url.pathname !== '/ws') return socket.destroy();
  const to = url.searchParams.has('host') ? hostWss : wss;
  to.handleUpgrade(req, socket, head, (ws) => to.emit('connection', ws, req));
});
/** One more (or, `by` -1, one fewer) of an address's links in `counts`; how many it has now. */
const count = (counts: Map<string, number>, ip: string, by: number) => {
  const n = (counts.get(ip) ?? 0) + by;
  if (n > 0) counts.set(ip, n);
  else counts.delete(ip);
  return n;
};

wss.on('connection', (ws, req) => connected(ws, req, false));
hostWss.on('connection', (ws, req) => connected(ws, req, true));

function connected(ws: WebSocket, req: http.IncomingMessage, host: boolean) {
  // Behind Caddy the socket's address is Caddy's; it passes the player's on.
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  const link: Link = {
    send: (f) => ws.readyState === ws.OPEN && ws.send(f),
    close: (code, reason) => ws.close(code, reason),
    get open() {
      return ws.readyState === ws.OPEN;
    },
    ip,
    since: Date.now(),
  };
  const reject = (reason: Rejection, m?: ToServer) => {
    log(m?.type === 'join' ? m.code : '-----', `${m?.type ?? 'link'} from ${ip} turned away: ${reason}`);
    link.send(encode({ type: 'rejected', reason }));
    ws.close(closeCode(reason), reason);
  };
  ws.on('close', () => (count(links, ip, -1), host && count(uploads, ip, -1)));
  // A message past the size limit and other socket errors close that link (ws does): unhandled, they'd end the process.
  ws.on('error', (e) => log('-----', `link from ${ip}: ${e.message}`));
  if (count(links, ip, 1) > SERVER.linksPerIp) return reject('too-many');
  if (host && (count(uploads, ip, 1) > SERVER.uploadsPerIp || hostWss.clients.size > SERVER.uploads)) return reject('too-many');
  let alive = true;
  ws.on('pong', () => (alive = true));
  const beat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 10_000);
  /** Their session and who they are in it, once welcomed; 'waiting' while a host or join is under way. */
  let at: { session: Session; player: Player } | 'waiting' | null = null;
  const hello = setTimeout(() => {
    if (at) return;
    log('-----', `link from ${ip}: no HOST or JOIN in ${SERVER.helloTimeout} s: closed`);
    ws.close(1008, 'no host or join');
  }, SERVER.helloTimeout * 1000);
  ws.on('message', async (data: Buffer) => {
    // A message the server can't handle closes that one link, never the server and everyone's sessions.
    try {
      const m = checkToServer(decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      if (!m) {
        log(at && at !== 'waiting' ? at.session.code : '-----', `bad message from ${ip}: closed`);
        return ws.close(1008, 'bad message');
      }
      if (at === 'waiting') return;
      // A link replaced by another (a reconnect, another tab) is no longer theirs.
      if (at) return at.player.link === link ? at.session.receive(at.player, m) : undefined;
      if (m.type !== 'host' && m.type !== 'join') return;
      at = 'waiting';
      const r = await enter(m, link, ip);
      if (typeof r === 'string') return reject(r, m);
      at = r;
      if (ws.readyState !== ws.OPEN) r.session.dropped(r.player, link);
    } catch (e) {
      log(at && at !== 'waiting' ? at.session.code : '-----', `server error with ${ip}: closed`, e);
      ws.close(1011, 'server error');
    }
  });
  ws.on('close', (code, reason) => {
    clearInterval(beat);
    clearTimeout(hello);
    if (!at || at === 'waiting' || at.player.link !== link) return;
    log(at.session.code, who(at.player), `dropped (${code}${reason.length ? ` ${reason}` : ''}): ${SERVER.rejoinWindow} s to come back`);
    at.session.dropped(at.player, link);
  });
}

/** HOST or JOIN: the session and the player, or why not. */
async function enter(m: Extract<ToServer, { type: 'host' | 'join' }>, link: Link, ip: string): Promise<{ session: Session; player: Player } | Rejection> {
  if (m.protocol !== PROTOCOL) return 'version';
  let session: Session;
  if (m.type === 'host') {
    if ([...hosts.values()].filter((h) => h === ip).length >= SERVER.sessionsPerIp) return 'too-many';
    if (liveMemory() > SERVER.hostMemory) return 'busy';
    const code = newCode();
    try {
      session = new Session(code, m.levelName, m.level, m.detail, () => {
        sessions.delete(code);
        hosts.delete(code);
        ended.set(code, Date.now());
        log(code, `closed: no one left, ${session.summary}`);
      });
    } catch (e) {
      log('-----', `host from ${ip}: the level doesn't build`, e);
      return 'bad-level';
    }
    if (session.table !== m.table) return 'version';
    if (m.bytes)
      try {
        await session.load(m.bytes);
      } catch (e) {
        log('-----', `host from ${ip}: paint file refused: ${(e as Error).message}`);
        return 'bad-save';
      }
    sessions.set(code, session);
    hosts.set(code, ip);
    const mb = session.memory;
    log(code, `hosted by ${ip}: ${m.levelName} at ${m.detail} texels/m, ${mb.now.toFixed(0)} MB of paint (${mb.full.toFixed(0)} MB if all painted), ${sessions.size} sessions`);
  } else {
    const found = sessions.get(m.code);
    if (!found) return ended.has(m.code) ? 'ended' : 'no-session';
    session = found;
  }
  const r = await session.admit(link, m.name, m.type === 'join' ? m.token : undefined);
  if (typeof r === 'string') {
    // A session turned down with its host has no one to close it.
    if (m.type === 'host') session.close();
    return r;
  }
  log(session.code, who(r.p), `in from ${ip} (${r.how}, ${session.players.size} players${r.note})`);
  return { session, player: r.p };
}

function newCode() {
  let code: string;
  do code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
  while (sessions.has(code) || ended.has(code));
  return code;
}

setInterval(() => sessions.forEach((s) => s.tick(1 / SERVER.dripRate)), 1000 / SERVER.dripRate);
setInterval(() => {
  sessions.forEach((s) => s.ping());
  for (const [code, at] of ended) if (Date.now() - at > SERVER.endedMemory * 1000) ended.delete(code);
}, SERVER.ping * 1000);
setInterval(() => {
  if (!sessions.size) return;
  const players = [...sessions.values()].reduce((n, s) => n + s.players.size, 0);
  log('-----', `memory: ${liveMemory().toFixed(0)} MB live, ${(process.memoryUsage.rss() / 2 ** 20).toFixed(0)} MB rss; ${sessions.size} sessions, ${players} players, ${waiting()} paint files in line`);
}, SERVER.statsEvery * 1000);
process.on('unhandledRejection', (e) => log('-----', 'unhandled', e));
// In a container this is PID 1, which has no default signal handlers.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));

const port = Number(process.env.PORT) || SERVER.port;
server.listen(port, () => log('-----', `roof server on :${port} (protocol ${PROTOCOL})`));
