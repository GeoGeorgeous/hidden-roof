// The server's log: one line per event, with the time (docker logs adds its
// own with -t; npm run server doesn't), the session's code first when there is one.

export function log(...parts: unknown[]) {
  console.log(`${new Date().toISOString().slice(0, 19)}Z`, ...parts);
}

/** A player as the log names them. */
export const who = (p: { id: number; name: string }) => `"${p.name}" #${p.id}`;

/** Bytes as MB, for the log. */
export const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(1);

/** A time (ms) as the log says it: "42 s", "12 min", "1 h 16 min". */
export function span(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 120) return `${s} s`;
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** What's alive (JS objects, paint), in MB: the process's own size (rss) stays up after sessions end, until the OS asks for it back. */
export function liveMemory() {
  const m = process.memoryUsage();
  return (m.heapUsed + m.arrayBuffers) / 2 ** 20;
}
