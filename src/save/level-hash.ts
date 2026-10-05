import type { Level } from '../level/level';

// Which level a paint save belongs to: a hash of what its paint surface keys
// come from. Keys name props by id (painting.ts PaintSurface.key), so the hash
// covers every level prop with its id, type, position, turn, setting and text;
// joints follow from those. Placed stepladders, the spawn and pickups aren't in
// it: moving them keeps saves. Any prop edit makes another version of the level.

export function levelHash(level: Level): string {
  const props = [...level.props.values()].filter((p) => !p.runtime).map((p) => [p.id, p.type, p.pos, p.rot, p.adjust ?? null, p.text ?? null]);
  return hash53(JSON.stringify(props));
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
