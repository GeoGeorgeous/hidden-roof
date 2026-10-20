// The game's imports leave out .ts (Vite resolves them); here a relative one without an extension gets it.
// Import this before any game source, which loads with a dynamic import.
import { register } from 'node:module';

const hook = `export async function resolve(s, c, next) {
  try { return await next(s, c); } catch (e) { if (/^\\.\\.?\\//.test(s) && !/\\.\\w+$/.test(s)) return next(s + '.ts', c); throw e; }
}`;
register(`data:text/javascript,${encodeURIComponent(hook)}`);
