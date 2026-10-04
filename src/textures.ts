import * as THREE from 'three';
import { lcg } from './lcg';
import { glyphAtlas } from './render/ink/glyphs';

// Procedural base textures: tiny canvases, nearest filtering, repeat wrapping.
// Architecture is flat; facades get their bands in the shader (render/ink/facade.ts).

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

  return { textures: { flat, panel, shutter, chainlink, glyphs: glyphAtlas() } };
}

let cache: ReturnType<typeof build> | null = null;
const all = () => (cache ??= build());

export type TexName = keyof ReturnType<typeof build>['textures'];

export function textures() {
  return all().textures;
}
