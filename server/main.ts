import './headless';
import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { SERVER } from '../src/config';
import { HELLO, PROTOCOL } from '../src/net/protocol';
import { adminApi } from './admin-api';
import { traffic } from './counts';
import { geoip, countryOf } from './geoip';
import { history } from './history';
import { Kept } from './kept';
import { addressOf, LobbyHttp } from './lobby-http';
import { liveMemory, log, logTo } from './log';
import { Lobby } from './lobby';
import type { Link } from './player';
import { waiting } from './snapshot';

// The multiplayer server: WebSocket sessions at /ws (net/protocol.ts), on
// SERVER.port (or PORT). A plain GET at /ws answers HELLO (the game asks it
// when it can't connect, to tell a server that's down from a blocked socket);
// /ws?list and /ws?code= answer the server list (lobby-http.ts);
// /healthz is for Docker. Caddy serves the game and passes /ws through
// (docs/deploy.md). One process, everything in memory but the public sessions
// kept in DATA_DIR (kept.ts) with the admin's history (history.ts); with ADMIN_KEY, the admin API on SERVER.adminPort
// (admin-api.ts). Every event is a log line.

// LOG_DIR: the log goes to files there, one a day, cleaned of IP addresses and nicknames as they age (server/log-files.ts).
if (process.env.LOG_DIR) logTo(process.env.LOG_DIR);
const lobby = new Lobby();
// Tests come back (and give up on a silent link) sooner than players.
SERVER.rejoinWindow = Number(process.env.REJOIN_WINDOW) || SERVER.rejoinWindow;
SERVER.helloTimeout = Number(process.env.HELLO_TIMEOUT) || SERVER.helloTimeout;
SERVER.heartbeat = Number(process.env.HEARTBEAT) || SERVER.heartbeat;
// Memory limits follow the container's (docs/deploy.md).
SERVER.hostMemory = Number(process.env.HOST_MEMORY) || SERVER.hostMemory;
SERVER.snapshotMemory = Number(process.env.SNAPSHOT_MEMORY) || SERVER.snapshotMemory;
SERVER.keepEvery = Number(process.env.KEEP_EVERY) || SERVER.keepEvery;
// PLAYER_HOST=1 lets players HOST their own private sessions; REGION is the server list's country code.
SERVER.playerHost = process.env.PLAYER_HOST === '1' || SERVER.playerHost;
SERVER.region = process.env.REGION || SERVER.region;

// The levels the admin's sessions are made of (the image has the repo's public/levels as levels/).
const kept = new Kept(lobby, process.env.LEVELS_DIR ?? 'public/levels', process.env.DATA_DIR || null);
// A DATA_DIR it can't use is no reason to stay down: the game runs, and the log says why nothing is kept.
await kept.restore().catch((e) => log('-----', 'kept sessions not restored:', e));
setInterval(() => void kept.save(), SERVER.keepEvery * 1000);
if (process.env.GEOIP_DB) await geoip(process.env.GEOIP_DB);
if (kept.dir) await history.keepIn(kept.dir).catch((e) => log('-----', 'history not read:', e));
setInterval(() => {
  history.sample([...lobby.sessions.values()].map((s) => [...s.players.values()].filter((p) => p.link).length), SERVER.historyEvery);
  void history.save();
}, SERVER.historyEvery * 1000);
const adminPort = Number(process.env.ADMIN_PORT) || SERVER.adminPort;
if (process.env.ADMIN_KEY) adminApi(lobby, kept, process.env.ADMIN_KEY).listen(adminPort, () => log('-----', `admin API on :${adminPort}`));
else log('-----', 'no ADMIN_KEY: no admin API');

const lobbyHttp = new LobbyHttp(lobby);
const server = http.createServer((req, res) => {
  const path = req.url?.split('?')[0];
  const listed = path === '/ws' && req.method === 'GET' ? lobbyHttp.reply(req) : null;
  if (listed) return void res.writeHead(listed.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(listed.body));
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
  const ip = addressOf(req);
  const link: Link = {
    send: (f) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(f);
      traffic.sent += f.length;
    },
    close: (code, reason) => ws.close(code, reason),
    get open() {
      return ws.readyState === ws.OPEN;
    },
    ip,
    country: countryOf(ip),
    since: Date.now(),
  };
  // A message past the size limit and other socket errors close that link (ws does): unhandled, they'd end the process.
  ws.on('error', (e) => log('-----', `link from ${ip}: ${e.message}`));
  const input = lobby.open(link, host);
  // Alive while bytes come in (SERVER.heartbeat), its state or anything else: the answer to the ws ping may come late.
  // Before its first message the lobby gives it SERVER.helloTimeout: a game busy loading may send its hello late.
  let read = req.socket.bytesRead;
  let greeted = false;
  let pinged = 0;
  ws.once('message', () => (greeted = true));
  ws.on('pong', () => (link.rtt = Math.round(performance.now() - pinged)));
  const beat = setInterval(() => {
    if (!greeted) return;
    if (req.socket.bytesRead === read) return ws.terminate();
    read = req.socket.bytesRead;
    pinged = performance.now();
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
// In a container this is PID 1, which has no default signal handlers. The kept sessions' paint and the history are saved first; a second signal doesn't wait.
let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT'])
  process.on(sig, () => {
    if (stopping) process.exit(0);
    stopping = true;
    void Promise.all([kept.save(), history.save()]).finally(() => process.exit(0));
  });

const port = Number(process.env.PORT) || SERVER.port;
server.listen(port, () => log('-----', `roof server on :${port} (protocol ${PROTOCOL})`));
