// A TCP proxy between one player's game (its Vite /ws proxy) and the game server
// that plays back a weak network, as home Wi-Fi, a hotspot or a VPN did in the
// playtest of 2026-10-12 (docs/playtest-multiplayer.md). Each direction queues and
// trickles out at its own rate (bytes a second; Infinity: at once, 0: nothing),
// after a delay (ms). The settings hold for every link the player opens, a
// reconnect's too. The server's WebSocket pings queue behind the rest, as there.
import net from 'node:net';

/** One direction: what comes in from `from` goes out to `to`, as `way` (the proxy's `down` or `up`) says. */
function pipe(from, to, way) {
  const p = { queue: [], queued: 0 };
  from.on('data', (d) => {
    if (way.rate === Infinity && !way.delay && !p.queued) return void (to.write(d), (way.bytes += d.length));
    p.queue.push({ d, at: Date.now() });
    p.queued += d.length;
    // Held here, as a kernel's send buffer would hold it (a few MB at most).
    if (p.queued > 4 * 2 ** 20) from.pause();
  });
  p.drain = (ms) => {
    let budget = way.rate === Infinity ? Infinity : (way.rate * ms) / 1000;
    while (budget > 0 && p.queue.length && Date.now() - p.queue[0].at >= way.delay) {
      const head = p.queue[0];
      const n = Math.min(head.d.length, budget);
      to.write(head.d.subarray(0, n));
      way.bytes += n;
      budget -= n;
      p.queued -= n;
      if (n === head.d.length) p.queue.shift();
      else head.d = head.d.subarray(n);
    }
    if (p.queued < 2 ** 20) from.resume();
  };
  return p;
}

/** Starts a proxy on `port` to the server on `target`. Set `down` and `up` (`rate`, `delay`) at any time; `bytes` counts what went through. */
export function linkProxy(port, target) {
  const proxy = { down: { rate: Infinity, delay: 0, bytes: 0 }, up: { rate: Infinity, delay: 0, bytes: 0 }, links: [] };
  const server = net.createServer((client) => {
    const upstream = net.connect(target);
    const link = { client, upstream, down: pipe(upstream, client, proxy.down), up: pipe(client, upstream, proxy.up) };
    proxy.links.push(link);
    const close = () => (client.destroy(), upstream.destroy(), proxy.links.splice(proxy.links.indexOf(link) >>> 0, 1));
    client.on('close', close).on('error', close);
    upstream.on('close', close).on('error', close);
  });
  const tick = setInterval(() => proxy.links.forEach((l) => (l.down.drain(20), l.up.drain(20))), 20);
  /** Back to a good network: what waits goes out at once. */
  proxy.open = () => Object.assign(proxy.down, { rate: Infinity, delay: 0 }) && Object.assign(proxy.up, { rate: Infinity, delay: 0 });
  /** The links die now, and what they held with them (as a link that drops does): the game opens a new one. */
  proxy.cut = () => [...proxy.links].forEach((l) => (l.client.destroy(), l.upstream.destroy()));
  proxy.close = () => (clearInterval(tick), server.close(), proxy.cut());
  server.listen(port);
  return proxy;
}
