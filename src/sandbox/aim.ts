import * as THREE from 'three';
import { FEEL } from './feel';

// R&D sandbox: the can's crosshair and the big flash text.

const label = document.createElement('div');
/** Screen-space opacity gauge around the crosshair: an arc of the paint's color, a dot as dense as one pass. */
const gauge = document.createElement('div');
const gaugeDot = document.createElement('div');
const gaugeText = document.createElement('div');
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
  document.body.append(label, gauge, gaugeDot, gaugeText);
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

let gaugeKey = '';
/**
 * The can's crosshair, in place of the game's while the can is out: as wide as
 * the spot will land (`px`, screen diameter), its ring an arc of the opacity in
 * the paint's color, a dot as dense as one pass; red when too close (runs).
 * `color` null hides it and gives the game's crosshair back.
 */
export function showGauge(color: string | null, px = 16, close = false, distance = -1) {
  const on = !!color && FEEL.on;
  const text = on && FEEL.showGap && distance >= 0;
  gaugeText.style.display = text ? 'block' : 'none';
  if (text) {
    const s = `${distance.toFixed(1)} м`;
    if (gaugeText.textContent !== s) gaugeText.textContent = s;
    gaugeText.style.opacity = distance <= FEEL.gap ? '0.85' : '0.35';
  }
  const size = Math.round(THREE.MathUtils.clamp(px, 12, 40));
  const key = on ? `${color}|${FEEL.opacity}|${size}|${close}` : '';
  pulseGauge();
  if (key === gaugeKey) return;
  gaugeKey = key;
  gauge.style.display = gaugeDot.style.display = on ? 'block' : 'none';
  const game = document.querySelector<HTMLElement>('.crosshair');
  if (game) game.style.visibility = on ? 'hidden' : '';
  if (!on) return;
  gauge.style.width = gauge.style.height = `${size}px`;
  gauge.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
  const deg = FEEL.opacity * 360;
  const arc = close ? '#ff3a1a' : color!;
  gauge.style.background = `conic-gradient(${arc} ${deg}deg, rgba(128,128,128,0.35) ${deg}deg)`;
  gaugeDot.style.background = color!;
  gaugeDot.style.opacity = String(0.2 + 0.6 * FEEL.opacity);
}
function pulseGauge() {
  const t = performance.now() / 1000 - opacityChangedAt;
  gauge.style.transform = t < 0.25 ? 'scale(1.1)' : 'scale(1)';
}
