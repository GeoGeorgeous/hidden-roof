// Tests of the link to the game server (src/net/server-link.ts) in Node, with a
// fake socket and clock: the hello once open, the upload's progress (and no
// giving up while it goes up), the keepalive, giving up on a silent server
// before the welcome but never after, a paint file's parts put together, and a
// link given up on that says nothing more.
// Usage: node scripts/server-link.test.mjs
import assert from 'node:assert/strict';
import { NET, SERVER } from '../src/config.ts';
import { decode, encode, PROTOCOL } from '../src/net/protocol.ts';
import { ServerLink } from '../src/net/server-link.ts';

class FakeSocket {
  readyState = 0;
  bufferedAmount = 0;
  binaryType = '';
  sent = [];
  onopen = null;
  onmessage = null;
  onclose = null;
  send(data) {
    this.sent.push(decode(data).type);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1005, reason: '', wasClean: true });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  receive(m) {
    this.onmessage?.({ data: encode(m).buffer });
  }
}

/** A link for `hello` on a fake socket, at time 0 (`at(s)` moves the clock); what it reported, in order. */
function link(hello) {
  let t = 0;
  let socket;
  const said = [];
  const l = new ServerLink(
    hello,
    { message: (m, _, file) => said.push(`message ${m.type}${file ? ` ${file.length} B` : ''}`), progress: (p) => said.push(p), log: () => {}, traffic: () => {}, closed: (_, timedOut) => said.push(`closed${timedOut ? ' (timed out)' : ''}`) },
    { url: 'ws://test/ws', open: () => (socket = new FakeSocket()), now: () => t },
  );
  return { l, socket, said, at: (s) => ((t = s), l.tick()) };
}

const join = { type: 'join', protocol: PROTOCOL, name: 'B', code: 'ABCDE' };

// Open: the hello goes, and the player reads what the server is doing.
{
  const { socket, said, at } = link(join);
  socket.open();
  assert.deepEqual([socket.sent, said], [['join'], ['Joining session…']]);
  // Nothing from the server: given up after NET.connectTimeout, not before.
  at(NET.connectTimeout - 0.5);
  assert.ok(!said.includes('closed (timed out)'));
  at(NET.connectTimeout + 0.5);
  assert.equal(said.at(-1), 'closed (timed out)');
}

// Keepalive: something goes up at least every SERVER.ping (pings, when nothing else does; the hello counts).
{
  const { socket, at } = link(join);
  socket.open();
  at(SERVER.ping + 0.1);
  assert.deepEqual(socket.sent, ['join', 'ping']);
  at(SERVER.ping + 0.2);
  assert.deepEqual(socket.sent, ['join', 'ping'], 'not again so soon');
  at(2 * SERVER.ping + 0.2);
  assert.deepEqual(socket.sent, ['join', 'ping', 'ping'], 'and again');
}

// HOST with a save: the upload's progress, no giving up while it goes up however long, then what the server does.
{
  const { socket, said, at } = link({ type: 'host', protocol: PROTOCOL, table: 'x', name: 'A', levelName: 'demo', level: {}, detail: 48, bytes: new Uint8Array(10000) });
  socket.bufferedAmount = 6000;
  socket.open();
  at(NET.connectTimeout * 3);
  socket.bufferedAmount = 0;
  at(NET.connectTimeout * 3 + 0.25);
  assert.deepEqual(said, ['Uploading paint 0%', 'Uploading paint 40%', 'Creating session from the save…']);
}

// A welcome whose paint file comes in parts: handled once, with the file; the player sees the download go.
{
  const { l, socket, said, at } = link(join);
  socket.open();
  socket.receive({ type: 'welcome', code: 'ABCDE', parts: 2 });
  socket.receive({ type: 'part', bytes: new Uint8Array(3) });
  socket.receive({ type: 'part', bytes: new Uint8Array(4) });
  assert.deepEqual(said.slice(1), ['Downloading paint 50%', 'Downloading paint 100%', 'message welcome 7 B']);
  // Welcomed: a silence is no longer this link's to judge (the session closes it after NET.serverSilence).
  l.live = true;
  at(NET.connectTimeout * 10);
  assert.ok(!said.some((s) => s.startsWith('closed')));
}

// Given up on (a new link replaces it, or the session's over): it closes and says nothing more.
{
  const { l, socket, said } = link(join);
  socket.open();
  l.abandon();
  socket.receive({ type: 'pong', t: 0, acked: 0 });
  assert.deepEqual([socket.readyState, said], [3, ['Joining session…']]);
  l.send({ type: 'ping', t: 1 });
  assert.deepEqual(socket.sent, ['join']);
}

console.log('server link: ok (hello, upload, keepalive, giving up before the welcome only, parts, abandoned)');
