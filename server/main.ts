import './headless';
import { randomInt } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SERVER } from '../src/config';
import { checkToServer, closeCode, CODE_LENGTH, CODE_LETTERS, decode, encode, HELLO, PROTOCOL, type Rejection, type ToServer } from '../src/net/protocol';
import { log, who } from './log';
import { Session, type Link, type Player } from './session';

// The multiplayer server: WebSocket sessions at /ws (net/protocol.ts), on
// SERVER.port (or PORT). A plain GET at /ws answers HELLO (the game asks it
// when it can't connect, to tell a server that's down from a blocked socket);
// /healthz is for Docker. Caddy serves the game and passes /ws through
// (docs/deploy.md). One process, everything in memory; every event is a log line.

const sessions = new Map<string, Session>();
/** Codes of sessions that ended, and when: joining one says it has ended rather than that there's no such code. */
const ended = new Map<string, number>();
// Tests come back sooner than players.
SERVER.rejoinWindow = Number(process.env.REJOIN_WINDOW) || SERVER.rejoinWindow;

const server = http.createServer((req, res) => {
  const path = req.url?.split('?')[0];
  const body = path === '/healthz' ? `ok, ${sessions.size} sessions\n` : path === '/ws' ? HELLO : null;
  // No caching: the game asks to learn whether the server is up now.
  res.writeHead(body ? 200 : 404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end(body ?? '');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: SERVER.maxPayload, perMessageDeflate: true });

wss.on('connection', (ws, req) => {
  // Behind Caddy the socket's address is Caddy's; it passes the player's on.
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  // Paint files (welcome, SAVE) are compressed already: only smaller frames go through the socket's compression.
  const link: Link = { send: (f) => ws.readyState === ws.OPEN && ws.send(f, { compress: f.length < 65536 }), close: (code, reason) => ws.close(code, reason) };
  let alive = true;
  ws.on('pong', () => (alive = true));
  const beat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 10_000);
  /** Their session and who they are in it, once welcomed; 'waiting' while a host or join is under way. */
  let at: { session: Session; player: Player } | 'waiting' | null = null;
  const reject = (reason: Rejection, m: ToServer) => {
    log(m.type === 'join' ? m.code : '-----', `${m.type} from ${ip} turned away: ${reason}`);
    link.send(encode({ type: 'rejected', reason }));
    ws.close(closeCode(reason), reason);
  };
  ws.on('message', async (data: Buffer) => {
    // A message the server can't handle closes that one link, never the server and everyone's sessions.
    try {
      const m = checkToServer(decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      if (!m) {
        log(at && at !== 'waiting' ? at.session.code : '-----', `bad message from ${ip}: closed`);
        return ws.close(1008, 'bad message');
      }
      if (at === 'waiting') return;
      if (at) return at.session.receive(at.player, m);
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
    if (!at || at === 'waiting' || at.player.link !== link) return;
    log(at.session.code, who(at.player), `dropped (${code}${reason.length ? ` ${reason}` : ''}): ${SERVER.rejoinWindow} s to come back`);
    at.session.dropped(at.player, link);
  });
});

/** HOST or JOIN: the session and the player, or why not. */
async function enter(m: Extract<ToServer, { type: 'host' | 'join' }>, link: Link, ip: string): Promise<{ session: Session; player: Player } | Rejection> {
  if (m.protocol !== PROTOCOL) return 'version';
  let session: Session;
  if (m.type === 'host') {
    // What's alive (JS objects, paint): the process's own size (rss) stays up after sessions end, until the OS asks for it back.
    const mem = process.memoryUsage();
    if (mem.heapUsed + mem.arrayBuffers > SERVER.hostMemory * 2 ** 20) return 'busy';
    const code = newCode();
    try {
      session = new Session(code, m.levelName, m.level, m.detail, () => {
        sessions.delete(code);
        ended.set(code, Date.now());
        log(code, 'closed: no one left');
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
    const mb = session.memory;
    log(code, `hosted by ${ip}: ${m.levelName} at ${m.detail} texels/m, ${mb.now.toFixed(0)} MB of paint (${mb.full.toFixed(0)} MB if all painted), ${sessions.size} sessions`);
  } else {
    const found = sessions.get(m.code);
    if (!found) return ended.has(m.code) ? 'ended' : 'no-session';
    session = found;
  }
  const r = await session.admit(link, m.name, m.type === 'join' ? m.token : undefined);
  if (!r) return 'full';
  log(session.code, who(r.p), `in from ${ip} (${r.how}, ${session.players.size} players)`);
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
process.on('unhandledRejection', (e) => log('-----', 'unhandled', e));
// In a container this is PID 1, which has no default signal handlers.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));

const port = Number(process.env.PORT) || SERVER.port;
server.listen(port, () => log('-----', `roof server on :${port} (protocol ${PROTOCOL})`));
