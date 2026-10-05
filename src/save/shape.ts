import type { SurfaceGeometry } from '../surfaces';

// A paint surface's shape, for saves: its faces and their sizes in meters
// (to the mm), hashed. The same at every paint detail; different when the
// prop's faces change (a sign's new text, a prop the game builds differently
// now), so paint saved for the old faces isn't put on the new ones.

export function shapeOf(geo: SurfaceGeometry): string {
  return hash53(geo.rects.map((r) => (r.meters ?? [r.w, r.h]).map((m) => Math.round(m * 1000)).join('x')).join(','));
}

/** cyrb53: a fast 53-bit string hash, as 14 hex digits. */
function hash53(s: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
