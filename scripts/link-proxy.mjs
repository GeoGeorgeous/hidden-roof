// A TCP proxy between the game (Vite's /ws proxy) and the game server that can
// narrow one link, as a weak home Wi-Fi or VPN did in the playtest of 2026-10-12
// (docs/playtest-multiplayer.md): each direction queues and trickles out at its
// own rate (bytes a second; Infinity: at once). The server's WebSocket pings
// queue behind the rest, as they did there.
import net from 'node:net';

/** One direction of a link: what comes in from `from` goes out to `to`, `rate` bytes a second. */
function pipe(from, to) {
  const p = { rate: Infinity, queue: [], queued: 0 };
  from.on('data', (d) => {
    if (p.rate === Infinity && !p.queued) return void to.write(d);
    p.queue.push(d);
    p.queued += d.length;
    // Held here, as a kernel's send buffer would hold it (a few MB at most).
    if (p.queued > 4 * 2 ** 20) from.pause();
  });
  p.drain = (ms) => {
    let budget = p.rate === Infinity ? Infinity : (p.rate * ms) / 1000;
    while (budget > 0 && p.queue.length) {
      const head = p.queue[0];
      const n = Math.min(head.length, budget);
      to.write(head.subarray(0, n));
      budget -= n;
      p.queued -= n;
      if (n === head.length) p.queue.shift();
      else p.queue[0] = head.subarray(n);
    }
    if (p.queued < 2 ** 20) from.resume();
  };
  return p;
}

/** Starts the proxy on `port`, to the server on `target`. Every link it carries is in `links`, oldest first: `down` and `up` are its two directions. */
export function linkProxy(port, target) {
  const links = [];
  const server = net.createServer((client) => {
    const upstream = net.connect(target);
    const link = { client, upstream, down: pipe(upstream, client), up: pipe(client, upstream) };
    links.push(link);
    const close = () => (client.destroy(), upstream.destroy());
    client.on('close', close).on('error', close);
    upstream.on('close', close).on('error', close);
  });
  const tick = setInterval(() => links.forEach((l) => (l.down.drain(50), l.up.drain(50))), 50);
  server.listen(port);
  return {
    links,
    close: () => (clearInterval(tick), server.close(), links.forEach((l) => (l.client.destroy(), l.upstream.destroy()))),
  };
}
