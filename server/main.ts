import './headless';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER } from '../src/config';
import { HELLO, PROTOCOL } from '../src/net/protocol';
import { liveMemory, log } from './log';
import { Lobby } from './lobby';
import type { Link } from './session';
import { waiting } from './snapshot';

// The multiplayer server: WebSocket sessions at /ws (net/protocol.ts), on
// SERVER.port (or PORT). A plain GET at /ws answers HELLO (the game asks it
// when it can't connect, to tell a server that's down from a blocked socket);
// /healthz is for Docker. Caddy serves the game and passes /ws through
// (docs/deploy.md). One process, everything in memory; every event is a log line.

const lobby = new Lobby();
// Tests come back (and give up on a silent link) sooner than players.
SERVER.rejoinWindow = Number(process.env.REJOIN_WINDOW) || SERVER.rejoinWindow;
SERVER.helloTimeout = Number(process.env.HELLO_TIMEOUT) || SERVER.helloTimeout;
SERVER.heartbeat = Number(process.env.HEARTBEAT) || SERVER.heartbeat;
// Memory limits follow the container's (docs/deploy.md).
SERVER.hostMemory = Number(process.env.HOST_MEMORY) || SERVER.hostMemory;
SERVER.snapshotMemory = Number(process.env.SNAPSHOT_MEMORY) || SERVER.snapshotMemory;

const server = http.createServer((req, res) => {
  const path = req.url?.split('?')[0];
  const body = path === '/healthz' ? `ok, ${lobby.sessions.size} sessions\n` : path === '/ws' ? HELLO : null;
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
  // A message past the size limit and other socket errors close that link (ws does): unhandled, they'd end the process.
  ws.on('error', (e) => log('-----', `link from ${ip}: ${e.message}`));
  const input = lobby.open(link, host);
  // Alive while bytes come in (SERVER.heartbeat), its state or anything else: the answer to the ws ping may come late.
  // Before its first message the lobby gives it SERVER.helloTimeout: a game busy loading may send its hello late.
  let read = req.socket.bytesRead;
  let greeted = false;
  ws.once('message', () => (greeted = true));
  const beat = setInterval(() => {
    if (!greeted) return;
    if (req.socket.bytesRead === read) return ws.terminate();
    read = req.socket.bytesRead;
    ws.ping();
  }, SERVER.heartbeat * 1000);
  ws.on('message', (data: Buffer) => void input.message(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
  ws.on('close', (code, reason) => (clearInterval(beat), input.closed(code, reason.toString())));
}

setInterval(() => lobby.tick(1 / SERVER.dripRate), 1000 / SERVER.dripRate);
setInterval(() => lobby.ping(), SERVER.ping * 1000);
setInterval(() => {
  if (!lobby.sessions.size) return;
  log('-----', `memory: ${liveMemory().toFixed(0)} MB live, ${(process.memoryUsage.rss() / 2 ** 20).toFixed(0)} MB rss; ${lobby.sessions.size} sessions, ${lobby.players} players, ${waiting()} paint files in line`);
}, SERVER.statsEvery * 1000);
process.on('unhandledRejection', (e) => log('-----', 'unhandled', e));
// In a container this is PID 1, which has no default signal handlers.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));

const port = Number(process.env.PORT) || SERVER.port;
server.listen(port, () => log('-----', `roof server on :${port} (protocol ${PROTOCOL})`));
