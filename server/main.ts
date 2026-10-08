import './headless';
import { randomInt } from 'node:crypto';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { SERVER } from '../src/config';
import { checkToServer, CODE_LENGTH, CODE_LETTERS, decode, encode, PROTOCOL, type Rejection, type ToServer } from '../src/net/protocol';
import { Session, type Link, type Player } from './session';

// The multiplayer server: WebSocket sessions at /ws (net/protocol.ts) and a
// health check at /healthz, on SERVER.port (or PORT). Caddy serves the game and
// passes /ws through (docs/deploy.md). One process, everything in memory.

const sessions = new Map<string, Session>();
// Tests come back sooner than players.
SERVER.rejoinWindow = Number(process.env.REJOIN_WINDOW) || SERVER.rejoinWindow;

const server = http.createServer((req, res) => {
  const ok = req.url === '/healthz';
  res.writeHead(ok ? 200 : 404, { 'content-type': 'text/plain' }).end(ok ? `ok, ${sessions.size} sessions\n` : '');
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: SERVER.maxPayload, perMessageDeflate: true });

wss.on('connection', (ws) => {
  // Paint files (welcome, SAVE) are compressed already: only smaller frames go through the socket's compression.
  const link: Link = { send: (f) => ws.readyState === ws.OPEN && ws.send(f, { compress: f.length < 65536 }), close: () => ws.close() };
  let alive = true;
  ws.on('pong', () => (alive = true));
  const beat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 10_000);
  /** Their session and who they are in it, once welcomed; 'waiting' while a host or join is under way. */
  let at: { session: Session; player: Player } | 'waiting' | null = null;
  const reject = (reason: Rejection) => {
    link.send(encode({ type: 'rejected', reason }));
    ws.close();
  };
  ws.on('message', async (data: Buffer) => {
    // A message the server can't handle closes that one link, never the server and everyone's sessions.
    try {
      const m = checkToServer(decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      if (!m) return ws.close(1008, 'bad message');
      if (at === 'waiting') return;
      if (at) return at.session.receive(at.player, m);
      if (m.type !== 'host' && m.type !== 'join') return;
      at = 'waiting';
      const r = await enter(m, link);
      if (typeof r === 'string') return reject(r);
      at = r;
      if (ws.readyState !== ws.OPEN) r.session.dropped(r.player, link);
    } catch (e) {
      console.error(e);
      ws.close(1011, 'server error');
    }
  });
  ws.on('close', () => {
    clearInterval(beat);
    if (at && at !== 'waiting') at.session.dropped(at.player, link);
  });
});

/** HOST or JOIN: the session and the player, or why not. */
async function enter(m: Extract<ToServer, { type: 'host' | 'join' }>, link: Link): Promise<{ session: Session; player: Player } | Rejection> {
  if (m.protocol !== PROTOCOL) return 'version';
  let session: Session;
  if (m.type === 'host') {
    // Each session costs ~15-25 MB before any paint (measured on the demo level), and its paint more.
    if (process.memoryUsage().rss > SERVER.hostMemory * 2 ** 20) return 'busy';
    const code = newCode();
    try {
      session = new Session(code, m.levelName, m.level, m.detail, () => {
        sessions.delete(code);
        console.log(`${code} closed`);
      });
    } catch (e) {
      console.error(e);
      return 'bad-level';
    }
    if (session.table !== m.table) return 'version';
    if (m.bytes)
      try {
        await session.load(m.bytes);
      } catch {
        return 'bad-save';
      }
    sessions.set(code, session);
    const mb = session.memory;
    console.log(`${code} hosted: ${m.levelName} at ${m.detail} texels/m, ${mb.now.toFixed(0)} MB of paint (${mb.full.toFixed(0)} MB if all painted)`);
  } else {
    const found = sessions.get(m.code);
    if (!found) return 'no-session';
    session = found;
  }
  const player = await session.admit(link, m.name, m.type === 'join' ? m.token : undefined);
  if (!player) return 'full';
  console.log(`${session.code}: ${player.name} in (${session.players.size} players)`);
  return { session, player };
}

function newCode() {
  let code: string;
  do code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
  while (sessions.has(code));
  return code;
}

setInterval(() => sessions.forEach((s) => s.tick(1 / SERVER.dripRate)), 1000 / SERVER.dripRate);
process.on('unhandledRejection', (e) => console.error(e));
setInterval(() => sessions.forEach((s) => s.ping()), SERVER.ping * 1000);
// In a container this is PID 1, which has no default signal handlers.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));

const port = Number(process.env.PORT) || SERVER.port;
server.listen(port, () => console.log(`roof server on :${port} (protocol ${PROTOCOL})`));
