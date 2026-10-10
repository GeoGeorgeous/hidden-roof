import * as THREE from 'three';
import { worldToTexel } from './paint-seams';
import type { Rect } from './surfaces';

// Images painted onto flat faces (PaintSystem.imprint: build mode's hints).
// An image is placed in the world, centered on a point of a face's plane;
// each texel of a face it covers takes the image's average over the texel.

/** `w` x `h` pixels of alpha (0..255, rows top down), `width` x `height` meters. */
export interface PaintImage {
  alpha: Uint8Array;
  w: number;
  h: number;
  width: number;
  height: number;
  /** How soft its edges are on the face: 1 as averaged into texels, down to 0, each texel painted fully or not at all (edge). */
  softness: number;
}

const corner = new THREE.Vector3();
const texel = new THREE.Vector2();
/** A texel's four quarter points: sampled smoothly, its average over the image. */
const QUARTERS = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];

/**
 * Where an image centered at world `center`, its x along `right` and its y
 * along `up` (unit vectors in the plane), falls on flat face `rect`: the
 * atlas texel box it covers, and each texel's alpha (0..1) at texel point (x, y).
 */
export function imageOnFace(img: PaintImage, rect: Rect, center: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
  // Image pixel coords are affine in atlas texel coords across a flat face: their steps per texel x and y, and where texel point (0, 0) lands.
  const f = rect.face!;
  const sx = img.w / img.width;
  const sy = img.h / img.height;
  const pxX = (f.uAxis.dot(right) / rect.w) * sx;
  const pxY = (f.vAxis.dot(right) / rect.h) * sx;
  const pyX = (-f.uAxis.dot(up) / rect.w) * sy;
  const pyY = (-f.vAxis.dot(up) / rect.h) * sy;
  const d = corner.subVectors(f.origin, center);
  const px0 = d.dot(right) * sx + img.w / 2 - rect.x * pxX - rect.y * pxY;
  const py0 = -d.dot(up) * sy + img.h / 2 - rect.x * pyX - rect.y * pyY;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    corner.copy(center).addScaledVector(right, (i * img.width) / 2).addScaledVector(up, (j * img.height) / 2);
    worldToTexel(rect, corner, texel);
    x0 = Math.min(x0, Math.floor(texel.x));
    y0 = Math.min(y0, Math.floor(texel.y));
    x1 = Math.max(x1, Math.floor(texel.x));
    y1 = Math.max(y1, Math.floor(texel.y));
  }
  const alpha = (x: number, y: number) => {
    let a = 0;
    for (const [qx, qy] of QUARTERS) a += sample(img, px0 + (x + qx) * pxX + (y + qy) * pxY, py0 + (x + qx) * pyX + (y + qy) * pyY);
    return edge(a / (4 * 255), img.softness);
  };
  return { x0, y0, x1, y1, alpha };
}

/** Alpha `a` (0..1) with its ramp around half narrowed to `softness` (1: as it is, 0: a step at half). */
export function edge(a: number, softness: number) {
  const half = softness / 2;
  return half < 1e-3 ? (a < 0.5 ? 0 : 1) : Math.min(1, Math.max(0, (a - 0.5 + half) / (2 * half)));
}

/** The image's alpha at pixel coords (x, y), bilinear between pixel centers; 0 outside it. */
function sample(img: PaintImage, x: number, y: number) {
  const fx = x - 0.5;
  const fy = y - 0.5;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const at = (px: number, py: number) => (px < 0 || py < 0 || px >= img.w || py >= img.h ? 0 : img.alpha[py * img.w + px]);
  const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
  const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}
