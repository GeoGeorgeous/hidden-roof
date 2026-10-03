import * as THREE from 'three';
import { SKYLINE } from './config';

// Procedural base textures: tiny canvases, nearest filtering, repeat wrapping.
// Architecture is flat (clean, Mirror's Edge-like); only the far skyline has
// detail (night facades with lit windows + a glow mask for them).

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) => void;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvasTexture(w: number, h: number, seed: number, paint: Painter, srgb = true): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h, rng(seed));
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

/** Night facade wall colors and how lit each variant is relative to SKYLINE.lit. */
const FACADES = [
  { wall: '#262931', lit: 1 },
  { wall: '#2d2b2a', lit: 0.75 },
  { wall: '#1f232b', lit: 1.25 },
];
const FACADE_PX = 32;

/**
 * Paint a night facade (dark wall, 8 x 8 windows, some lit) and its glow mask
 * onto existing canvases. Lit windows follow SKYLINE: `randomness` mixes whole
 * lit/dark floors (0) with independent windows (1).
 */
function paintFacade(i: number, base: HTMLCanvasElement, glow: HTMLCanvasElement) {
  const { wall, lit } = FACADES[i];
  const r = rng(10 + i + SKYLINE.seed * 101);
  const p = Math.min(1, SKYLINE.lit * lit);
  const cells: { x: number; y: number; color: string | null; k: number }[] = [];
  for (let y = 0; y < FACADE_PX; y += 4) {
    const floorOn = r() < p;
    for (let x = 0; x < FACADE_PX; x += 4) {
      const own = r() < SKYLINE.randomness;
      const on = own ? r() < p : floorOn;
      const color = ['#ffc778', '#ffe1a8', '#bcd2ff', '#ffb86b'][Math.floor(r() * 4)];
      cells.push({ x, y, color: on ? color : null, k: 1 - SKYLINE.brightnessVariation * r() });
    }
  }
  const b = base.getContext('2d')!;
  const g = glow.getContext('2d')!;
  b.globalAlpha = g.globalAlpha = 1;
  b.fillStyle = wall;
  b.fillRect(0, 0, FACADE_PX, FACADE_PX);
  g.fillStyle = '#000';
  g.fillRect(0, 0, FACADE_PX, FACADE_PX);
  for (const c of cells) {
    b.fillStyle = '#101318';
    b.fillRect(c.x + 1, c.y + 1, 2, 2);
    if (!c.color) continue;
    for (const ctx of [b, g]) {
      ctx.globalAlpha = c.k;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x + 1, c.y + 1, 2, 2);
      ctx.globalAlpha = 1;
    }
  }
}

function facade(i: number) {
  const base = canvasTexture(FACADE_PX, FACADE_PX, 0, () => {});
  const glow = canvasTexture(FACADE_PX, FACADE_PX, 0, () => {});
  paintFacade(i, base.image as HTMLCanvasElement, glow.image as HTMLCanvasElement);
  return { base, glow };
}

/** Redraw the facade textures after SKYLINE changed. */
export function repaintFacades() {
  const t = all();
  (['facadeA', 'facadeB', 'facadeC'] as const).forEach((k, i) => {
    const base = t.textures[k];
    const glow = t.glows[k]!;
    paintFacade(i, base.image as HTMLCanvasElement, glow.image as HTMLCanvasElement);
    base.needsUpdate = glow.needsUpdate = true;
  });
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

  const a = facade(0);
  const b = facade(1);
  const c = facade(2);
  return {
    textures: { flat, panel, shutter, chainlink, facadeA: a.base, facadeB: b.base, facadeC: c.base },
    glows: { facadeA: a.glow, facadeB: b.glow, facadeC: c.glow } as Partial<Record<string, THREE.Texture>>,
  };
}

let cache: ReturnType<typeof build> | null = null;
const all = () => (cache ??= build());

export type TexName = keyof ReturnType<typeof build>['textures'];

export function textures() {
  return all().textures;
}

/** Emissive mask for a base texture (lit windows), if it has one. */
export function glowFor(name: TexName): THREE.Texture | null {
  return all().glows[name] ?? null;
}
