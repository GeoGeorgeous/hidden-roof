// The paint save file (.rhhpaint): paint only, no map. "RHHP", the header's
// length (u32, little-endian), a JSON header naming the level it belongs to and
// every painted face, then the paint of those faces, deflated: each face as its
// own small RGBA image, its rect plus the 1-texel ring around it, in header order.
// Faces are named by surface key and rect index (painting.ts PaintSurface.key),
// the same at every paint detail, and each painted surface's shape is kept
// (shape.ts), so a load only puts paint on faces that are still the same;
// `density` is the texels per meter they were saved at. The same bytes will be
// the multiplayer join snapshot.
// Version 2: surface shapes instead of a hash of the whole level (version 1).

const MAGIC = 'RHHP';
const VERSION = 2;

/** A painted face in the file: surface key, rect index, and its size in texels (without the ring). */
export interface PaintFileFace {
  surface: string;
  rect: number;
  w: number;
  h: number;
}

export interface PaintFileHeader {
  format: 'rhh-paint';
  version: number;
  created: string;
  /** The level the paint was saved on (for messages). */
  level: { name: string };
  /** Texels per meter of the saved faces. */
  density: number;
  /** Shape of every surface a face is on (shape.ts), by key. */
  surfaces: Record<string, string>;
  faces: PaintFileFace[];
}

/** Bytes of one face's paint in the body: its rect plus the 1-texel ring around it, RGBA. */
export const faceBytes = (f: PaintFileFace) => (f.w + 2) * (f.h + 2) * 4;

export async function encodePaintFile(header: Omit<PaintFileHeader, 'format' | 'version'>, body: Uint8Array): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify({ ...header, format: 'rhh-paint', version: VERSION }));
  const packed = await pipe(body, new CompressionStream('deflate'));
  const out = new Uint8Array(8 + json.length + packed.length);
  out.set(new TextEncoder().encode(MAGIC));
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  out.set(packed, 8 + json.length);
  return out;
}

/** The header and the paint of a save; throws an Error with a message for the player if the file is no good. */
export async function decodePaintFile(bytes: Uint8Array): Promise<{ header: PaintFileHeader; body: Uint8Array }> {
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) throw new Error('NOT A PAINT FILE');
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
  let header: PaintFileHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length)));
  } catch {
    throw new Error('BROKEN PAINT FILE');
  }
  if (header?.format !== 'rhh-paint') throw new Error('NOT A PAINT FILE');
  if (!isCount(header.version, 1)) throw new Error('BROKEN PAINT FILE');
  if (header.version > VERSION) throw new Error('SAVED BY A NEWER VERSION');
  if (header.version < VERSION) throw new Error('SAVED BY AN OLDER VERSION');
  const ok = typeof header.level?.name === 'string' && header.density > 0 && typeof header.surfaces === 'object' && Array.isArray(header.faces);
  if (!ok || !header.faces.every((f) => isFace(f) && typeof header.surfaces[f.surface] === 'string')) throw new Error('BROKEN PAINT FILE');
  // The header says how much paint there is: inflating stops past it (a small broken file can't fill memory).
  const size = header.faces.reduce((n, f) => n + faceBytes(f), 0);
  const body = await inflate(bytes.subarray(8 + length), size);
  if (body?.length !== size) throw new Error('BROKEN PAINT FILE');
  return { header, body };
}

const isCount = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
const isFace = (f: PaintFileFace) => typeof f?.surface === 'string' && isCount(f.rect, 0) && isCount(f.w, 1) && isCount(f.h, 1);

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(through)).arrayBuffer());
}

/** Inflates up to `size` bytes; null if the data is broken or holds more. */
async function inflate(bytes: Uint8Array, size: number) {
  const out = new Uint8Array(size);
  let n = 0;
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      if (n + r.value.length > size) {
        await reader.cancel();
        return null;
      }
      out.set(r.value, n);
      n += r.value.length;
    }
  } catch {
    return null;
  }
  return n === size ? out : null;
}
