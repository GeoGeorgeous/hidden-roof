import * as THREE from 'three';
import { lcg } from './lcg';
import { panelAtlas } from './render/ink/panel-text';
import { wordAtlas } from './render/ink/words';
import { neonAtlas } from './render/ink/neon-text';

// Procedural base textures: tiny canvases, nearest filtering, repeat wrapping.
// Architecture is flat; facades get their bands in the shader (render/ink/facade.ts).
// Grays only, like a height map: joints and cracks darker, faces lighter, so
// the ink draws them as lines and lets the faces stay paper. The finishes of
// walls and floors (kit/finishes.ts) choose among them.

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

function canvasTexture(w: number, h: number, seed: number, paint: Painter, srgb = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h, lcg(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Draw something at its spot and shifted a tile each way, so it wraps across the edges seamlessly. */
function wrapped(w: number, h: number, draw: (dx: number, dy: number) => void) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) draw(dx, dy);
}

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, amp: number) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    for (let c = 0; c < 3; c++) img.data[i + c] = Math.max(0, Math.min(255, img.data[i + c] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function build() {
  // Clean flat surfaces: white (tinted per piece) with a whisper of noise.
  const flat = canvasTexture(8, 8, 20, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, rnd, 5);
  });
  // Flat with a faint seam every 2 m (one grid module at 24 px/m).
  const panel = canvasTexture(48, 48, 21, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, rnd, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(w - 1, 0, 1, h);
  });
  // Plaster: soft patches and three dark hairline cracks, 4 m a tile; no seams.
  const plaster = canvasTexture(96, 96, 22, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const [x, y, r] = [rnd() * w, rnd() * h, 6 + rnd() * 18];
      wrapped(w, h, (dx, dy) => {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.12)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
      });
    }
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    for (let i = 0; i < 3; i++) {
      let [x, y] = [rnd() * w, rnd() * h];
      for (let k = 0; k < 26; k++) {
        const [px, py] = [x, y];
        wrapped(w, h, (dx, dy) => ctx.fillRect(Math.floor(px + dx), Math.floor(py + dy), 1, 1));
        x += rnd() * 2 - 0.6;
        y += rnd() * 2 - 1;
      }
    }
    noise(ctx, w, h, rnd, 4);
  });
  // Brick in running bond: 0.3 x 0.1 m bricks (24 x 8 px; the material tiles every 0.6 m), each a little lighter or darker, in darker mortar.
  const brick = canvasTexture(48, 48, 23, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < h / 8; row++) {
      for (let col = 0; col < w / 24; col++) {
        const v = Math.round(222 + rnd() * 33);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        // A brick of an offset row that runs off the right edge comes back on the left.
        for (const dx of [0, -w]) ctx.fillRect(col * 24 + (row % 2) * 12 + 1 + dx, row * 8 + 1, 23, 7);
      }
    }
    noise(ctx, w, h, rnd, 6);
  });
  // Roof pavers: 0.5 m concrete slabs (16 px; the material tiles every 2 m), each its own shade, in dark joints.
  const pavers = canvasTexture(64, 64, 24, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#8c8c8c';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        const v = Math.round(226 + rnd() * 29);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x + 1, y + 1, 15, 15);
      }
    }
    noise(ctx, w, h, rnd, 6);
  });
  const shutter = canvasTexture(16, 16, 8, (ctx, w, h, rnd) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y, w, 1);
    }
    noise(ctx, w, h, rnd, 6);
  });
  // Chain-link: diamond wire on transparent background, no mipmaps.
  const chainlink = canvasTexture(16, 16, 9, (ctx, w) => {
    ctx.fillStyle = '#9aa1a3';
    for (let i = 0; i < w; i++) {
      for (const k of [0, 8]) {
        ctx.fillRect((i + k) % w, i, 1, 1);
        ctx.fillRect((w - 1 - i + k) % w, i, 1, 1);
      }
    }
  });
  chainlink.minFilter = THREE.NearestFilter;
  chainlink.generateMipmaps = false;

  return { textures: { flat, panel, plaster, brick, pavers, shutter, chainlink, panelText: panelAtlas(), words: wordAtlas(), neonText: neonAtlas() } };
}

let cache: ReturnType<typeof build> | null = null;
const all = () => (cache ??= build());

export type TexName = keyof ReturnType<typeof build>['textures'];

/** The lettering atlases: drawn straight from the texture, not lit (LETTERS in render/ink/tone.ts). */
export const LETTER_TEXTURES: ReadonlySet<TexName> = new Set<TexName>(['panelText', 'words', 'neonText']);

export function textures() {
  return all().textures;
}
