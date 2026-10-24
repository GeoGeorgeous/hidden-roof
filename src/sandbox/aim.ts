import * as THREE from 'three';
import type { Rect } from '../surfaces';
import { FEEL, slantShape } from './feel';

// R&D sandbox: the can's crosshair and the big flash text.

const label = document.createElement('div');
/** Screen-space opacity gauge around the crosshair: an arc of the paint's color, a dot as dense as one pass. */
const gauge = document.createElement('div');
const gaugeDot = document.createElement('div');
const gaugeText = document.createElement('div');
/** The crosshair laid on the wall (FEEL.aimWall): the rest of the ring and the opacity arc, ellipses with a hairline at any size. */
const SVG = 'http://www.w3.org/2000/svg';
const wallRing = document.createElementNS(SVG, 'svg');
const wallRest = document.createElementNS(SVG, 'ellipse');
const wallArc = document.createElementNS(SVG, 'ellipse');
let opacityChangedAt = -1;

export function initAim() {
  Object.assign(label.style, {
    position: 'fixed', top: '30%', width: '100%', textAlign: 'center', font: 'bold 28px monospace',
    color: '#fff', textShadow: '0 0 6px #000, 0 0 2px #000', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.3s', zIndex: '9999',
  });
  Object.assign(gauge.style, {
    position: 'fixed', left: '50%', top: '50%', borderRadius: '50%',
    pointerEvents: 'none', zIndex: '9997', display: 'none', transition: 'transform 0.15s, width 0.08s, height 0.08s, margin 0.08s',
    // A hairline ring at any size: the conic fill shows only at the rim. Barely there, like the game's.
    mask: 'radial-gradient(closest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1px))',
    webkitMask: 'radial-gradient(closest-side, transparent calc(100% - 1.6px), #000 calc(100% - 1px))',
    opacity: '0.75',
  });
  Object.assign(gaugeDot.style, {
    position: 'fixed', left: '50%', top: '50%', width: '3px', height: '3px', margin: '-1.5px 0 0 -1.5px', borderRadius: '50%',
    pointerEvents: 'none', zIndex: '9997', display: 'none',
  });
  Object.assign(gaugeText.style, {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, 26px)', font: '11px monospace',
    color: '#000', textShadow: '0 0 2px rgba(255,255,255,0.6)', pointerEvents: 'none', zIndex: '9997', display: 'none',
  });
  // A zero-size box at the screen's middle: the ellipses are drawn around its corner.
  Object.assign(wallRing.style, { position: 'fixed', left: '50%', top: '50%', width: '1px', height: '1px', overflow: 'visible', pointerEvents: 'none', zIndex: '9997', display: 'none', opacity: '0.75' });
  for (const e of [wallRest, wallArc]) {
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke-width', '1.2');
  }
  wallRest.setAttribute('stroke', 'rgba(128,128,128,0.35)');
  wallArc.setAttribute('pathLength', '1');
  // The arc starts at the ring's top (an ellipse's path starts at its right end, going clockwise).
  wallArc.setAttribute('stroke-dashoffset', '0.25');
  wallRing.append(wallRest, wallArc);
  document.body.append(label, gauge, gaugeDot, gaugeText, wallRing);
}

export function flash(text: string) {
  label.textContent = text;
  label.style.opacity = '1';
  clearTimeout((flash as { t?: number }).t);
  (flash as { t?: number }).t = window.setTimeout(() => (label.style.opacity = '0'), 1200);
}

/** The opacity just changed: the ring pulses. */
export function opacityChanged() {
  opacityChangedAt = performance.now() / 1000;
}

export interface Ellipse {
  /** Semi-axes (px) and the first one's angle on screen (rad). */
  rx: number;
  ry: number;
  angle: number;
}
const ellipse: Ellipse = { rx: 0, ry: 0, angle: 0 };
const v = new THREE.Vector3();
const along = new THREE.Vector3();
const across = new THREE.Vector3();
const slant = { elong: 1, ang: 0, cos: 1 };

/** A wall point's offset from the crosshair (px, y down). */
function offset(camera: THREE.Camera, p: THREE.Vector3, out: [number, number]) {
  v.copy(p).project(camera);
  out[0] = (v.x * window.innerWidth) / 2;
  out[1] = (-v.y * window.innerHeight) / 2;
  return out;
}
const c: [number, number] = [0, 0];
const a: [number, number] = [0, 0];
const b: [number, number] = [0, 0];

/**
 * The dab as it lands on the wall, as seen: a circle of radius `r` (m) on the
 * face, stretched along the aim as the brush stretches it (FEEL.slant). Null
 * when the face has no plane.
 */
export function wallEllipse(camera: THREE.Camera, point: THREE.Vector3, rect: Rect | undefined, forward: THREE.Vector3, r: number) {
  const n = rect?.face?.normal;
  if (!n) return null;
  along.copy(forward).addScaledVector(n, -forward.dot(n));
  if (along.lengthSq() < 1e-8) along.copy(rect.face!.uAxis);
  along.normalize();
  across.crossVectors(n, along).normalize();
  const s = slantShape(rect, forward, slant);
  const elong = s && FEEL.slant > 0 ? s.elong : 1;
  offset(camera, point, c);
  offset(camera, along.multiplyScalar(r * elong).add(point), a);
  offset(camera, across.multiplyScalar(r).add(point), b);
  // The circle's image is the ellipse of the 2x2 map [a b]: its singular values and their angle.
  const [m00, m10, m01, m11] = [a[0] - c[0], a[1] - c[1], b[0] - c[0], b[1] - c[1]];
  const e = (m00 + m11) / 2;
  const f = (m00 - m11) / 2;
  const g = (m10 + m01) / 2;
  const h = (m10 - m01) / 2;
  const q = Math.hypot(e, h);
  const w = Math.hypot(f, g);
  ellipse.rx = q + w;
  ellipse.ry = Math.abs(q - w);
  ellipse.angle = (Math.atan2(g, f) + Math.atan2(h, e)) / 2;
  return ellipse;
}

let gaugeKey = '';
/**
 * The can's crosshair, in place of the game's while the can is out: as wide as
 * the spot will land (`px`, screen diameter), its ring an arc of the opacity in
 * the paint's color, a dot as dense as one pass; red when too close (runs).
 * `color` null hides it and gives the game's crosshair back.
 */
export function showGauge(color: string | null, px = 16, close = false, distance = -1, shape: Ellipse | null = null) {
  const on = !!color && FEEL.on;
  const wall = on && FEEL.aimWall && !!shape;
  const text = on && FEEL.showGap && distance >= 0;
  gaugeText.style.display = text ? 'block' : 'none';
  if (text) {
    const s = `${distance.toFixed(1)} м`;
    if (gaugeText.textContent !== s) gaugeText.textContent = s;
    gaugeText.style.opacity = distance <= FEEL.gap ? '0.85' : '0.35';
  }
  const size = Math.round(FEEL.aimTrue ? THREE.MathUtils.clamp(px, 6, 2000) : THREE.MathUtils.clamp(px, 12, 40));
  const rx = wall ? Math.round(THREE.MathUtils.clamp(shape!.rx, 3, 1000)) : 0;
  const ry = wall ? Math.round(THREE.MathUtils.clamp(shape!.ry, 3, 1000)) : 0;
  const deg = wall ? Math.round((shape!.angle * 180) / Math.PI) : 0;
  const key = on ? `${color}|${FEEL.opacity}|${size}|${close}|${rx}|${ry}|${deg}` : '';
  pulseGauge();
  if (key === gaugeKey) return;
  gaugeKey = key;
  gaugeDot.style.display = on ? 'block' : 'none';
  gauge.style.display = on && !wall ? 'block' : 'none';
  wallRing.style.display = wall ? 'block' : 'none';
  const game = document.querySelector<HTMLElement>('.crosshair');
  if (game) game.style.visibility = on ? 'hidden' : '';
  if (!on) return;
  const arc = close ? '#ff3a1a' : color!;
  if (wall) {
    for (const e of [wallRest, wallArc]) {
      e.setAttribute('rx', String(rx));
      e.setAttribute('ry', String(ry));
      e.setAttribute('transform', `rotate(${deg})`);
    }
    wallArc.setAttribute('stroke', arc);
    wallArc.setAttribute('stroke-dasharray', `${FEEL.opacity} ${1 - FEEL.opacity}`);
  } else {
    gauge.style.width = gauge.style.height = `${size}px`;
    gauge.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    const turn = FEEL.opacity * 360;
    gauge.style.background = `conic-gradient(${arc} ${turn}deg, rgba(128,128,128,0.35) ${turn}deg)`;
  }
  gaugeDot.style.background = color!;
  gaugeDot.style.opacity = String(0.2 + 0.6 * FEEL.opacity);
}
function pulseGauge() {
  const t = performance.now() / 1000 - opacityChangedAt;
  gauge.style.transform = wallRing.style.transform = t < 0.25 ? 'scale(1.1)' : 'scale(1)';
}
