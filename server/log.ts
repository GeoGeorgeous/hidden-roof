// The server's log: one line per event, with the time (docker logs adds its
// own with -t; npm run server doesn't), the session's code first when there is one.

export function log(...parts: unknown[]) {
  console.log(`${new Date().toISOString().slice(0, 19)}Z`, ...parts);
}

/** A player as the log names them. */
export const who = (p: { id: number; name: string }) => `"${p.name}" #${p.id}`;
