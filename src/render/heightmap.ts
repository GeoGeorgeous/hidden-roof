import * as THREE from 'three';

// Top-surface height of the level on a 0.5 m grid, built from colliders.
// Rain uses it to stop drops under roofs.

const CELL = 0.5;
const NONE = -10000;

export class Heightmap {
  texture: THREE.DataTexture = empty();
  readonly origin = new THREE.Vector2();
  readonly size = new THREE.Vector2(1, 1);

  /** Top surface height at (x, z) on the CPU, or -Infinity outside / over nothing. */
  heightAt(x: number, z: number) {
    const img = this.texture.image as { data: Float32Array; width: number; height: number };
    const i = Math.floor(((x - this.origin.x) / this.size.x) * img.width);
    const j = Math.floor(((z - this.origin.y) / this.size.y) * img.height);
    if (i < 0 || j < 0 || i >= img.width || j >= img.height) return -Infinity;
    return img.data[j * img.width + i];
  }

  rebuild(colliders: THREE.Box3[], bounds: THREE.Box3) {
    this.texture.dispose();
    if (bounds.isEmpty()) {
      this.texture = empty();
      return;
    }
    const m = 2;
    const x0 = Math.floor(bounds.min.x - m);
    const z0 = Math.floor(bounds.min.z - m);
    const w = Math.ceil((bounds.max.x + m - x0) / CELL);
    const h = Math.ceil((bounds.max.z + m - z0) / CELL);
    const data = new Float32Array(w * h).fill(NONE);
    for (const c of colliders) {
      const i0 = Math.max(0, Math.floor((c.min.x - x0) / CELL));
      const i1 = Math.min(w - 1, Math.ceil((c.max.x - x0) / CELL) - 1);
      const j0 = Math.max(0, Math.floor((c.min.z - z0) / CELL));
      const j1 = Math.min(h - 1, Math.ceil((c.max.z - z0) / CELL) - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) data[j * w + i] = Math.max(data[j * w + i], c.max.y);
    }
    this.texture = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
    this.texture.needsUpdate = true;
    this.origin.set(x0, z0);
    this.size.set(w * CELL, h * CELL);
  }
}

function empty() {
  const t = new THREE.DataTexture(new Float32Array([NONE]), 1, 1, THREE.RedFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

/** GLSL helper for the rain shader. */
export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uHOrigin;
uniform vec2 uHSize;
float heightAt(vec2 xz) {
  vec2 uv = (xz - uHOrigin) / uHSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -10000.0;
  return texture2D(uHeight, uv).r;
}
`;
