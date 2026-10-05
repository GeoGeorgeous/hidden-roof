// The paint save file (.rhhpaint): paint only, no map. "RHHP", the header's
// length (u32, little-endian), a JSON header naming the level it belongs to and
// every painted face, then the paint of those faces, deflated: each face as its
// own small RGBA image, its rect plus the 1-texel ring around it, in header order.
// Faces are named by surface key and rect index (painting.ts PaintSurface.key),
// the same at every paint detail; `density` is the texels per meter they were
// saved at. The same bytes will be the multiplayer join snapshot.

const MAGIC = 'RHHP';
const VERSION = 1;

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
  /** The level the paint belongs to: its name, and a hash of what its paint surfaces come from (level-hash.ts). */
  level: { name: string; hash: string };
  /** Texels per meter of the saved faces. */
  density: number;
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
  let body: Uint8Array;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length)));
    body = await pipe(bytes.subarray(8 + length), new DecompressionStream('deflate'));
  } catch {
    throw new Error('BROKEN PAINT FILE');
  }
  if (header.format !== 'rhh-paint') throw new Error('NOT A PAINT FILE');
  if (header.version > VERSION) throw new Error('SAVED BY A NEWER VERSION');
  const ok = typeof header.level?.hash === 'string' && header.density > 0 && Array.isArray(header.faces) && header.faces.every(isFace);
  if (!ok || body.length !== header.faces.reduce((n, f) => n + faceBytes(f), 0)) throw new Error('BROKEN PAINT FILE');
  return { header, body };
}

const isCount = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min;
const isFace = (f: PaintFileFace) => typeof f?.surface === 'string' && isCount(f.rect, 0) && isCount(f.w, 1) && isCount(f.h, 1);

async function pipe(bytes: Uint8Array, through: CompressionStream | DecompressionStream) {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(through)).arrayBuffer());
}
