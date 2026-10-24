import * as THREE from 'three';
import GUI from 'lil-gui';
import { PAINT, type CapSpec } from '../config';
import type { DotShape } from '../paint-raster';
import type { Rect } from '../surfaces';

// R&D sandbox (exp/visual-sandbox): how spraying feels. Not for production.
//  - distance changes the dot's character: close = narrow, hard, heavy, runs;
//    far = wide, soft, speckled
//  - overspray: a halo of faint fine dust around every line
//  - spatter: big hard droplets, more of them far away, at low pressure, at the
//    start of a press (spit) and as it's let go (tail)
//  - slant: a dot hitting the wall at an angle stretches into an ellipse along
//    the aim, fading at the far end
//  - nibs: round (the cap as is), chisel (a 45° calligraphy nib), needle
//  - fast aim thins the line (flicks taper)
//  - one crosshair for the can: the spot's real size, the opacity, too close
// Z shows the panel, X cycles nibs.

export const NIBS = ['round', 'chisel', 'needle'] as const;
export type Nib = (typeof NIBS)[number];

export const FEEL = {
  on: true,
  /** Under the crosshair: the distance to the wall, bright inside the gap. */
  showGap: false,
  nib: 'round' as Nib,
  // Brush (sandbox/brush.ts): paint at once, as a continuous stroke
  brush: true,
  /** One pass of a stroke reaches about this opacity (Shift + wheel). */
  opacity: 0.5,
  /** Dab spacing, a fraction of the dab's radius. */
  spacing: 0.2,
  /** Aim smoothing (StreamLine), 0 = off. */
  streamline: 0.25,
  closeSoft: 0.3,
  /** Speed (m/s over the wall) up to which a line is as set; faster, it thins, widens and softens. */
  speedRef: 0.8,
  speedFade: 0.8,
  speedWiden: 0.7,
  speedSoft: 0.4,
  farSoft: 0.95,
  // Distance
  /** Up to this far from the wall (m) the spray acts as if close up: the near effects, the spread and the fade start past it. */
  gap: 0.6,
  closeAt: 0.25,
  farAt: 2.5,
  closeSize: 0.55,
  farSize: 2.2,
  closeFlow: 1.8,
  closeDrips: 4,
  // Overspray
  overspray: 0,
  oversprayCone: 3.5,
  oversprayAmount: 0.12,
  // Spatter
  spatter: 0,
  spatterLowPressure: 0,
  spatterSize: 0.7,
  spit: 0,
  spitTime: 0.09,
  releaseTail: 0.14,
  // Slant
  slant: 1,
  maxElong: 4,
  tail: 0.7,
  // Chisel
  chiselRatio: 7,
  chiselAngle: 45,
  // Gesture
  speedThin: 0.12,
};

/** The values the panel starts with, for its reset. */
const DEFAULTS = { ...FEEL };

// --- Per particle ---

export interface Landing {
  /** Paint per particle, radius (m), softness, drips per m², shape. */
  amount: number;
  radius: number;
  softness: number;
  drips: number;
  shape: DotShape | undefined;
}

/** The distance the spray acts as if from: FEEL.gap less, so that far from the wall it's still as close up. */
export const sprayDistance = (distance: number) => Math.max(0.05, distance - FEEL.gap);

/** How far into the far range a hit at `distance` is: 0 close, 1 far. */
export const farness = (distance: number) => THREE.MathUtils.clamp((sprayDistance(distance) - FEEL.closeAt) / (FEEL.farAt - FEEL.closeAt), 0, 1);

/** Ellipse of a ray along `dir` meeting face `rect` (null: it has no plane). */
export function slantShape(rect: Rect | undefined, dir: THREE.Vector3, out: { elong: number; ang: number; cos: number }) {
  const f = rect?.face;
  if (!f) return null;
  const c = Math.abs(f.normal.dot(dir));
  const u = dir.dot(f.uAxis) / f.uAxis.length();
  const v = dir.dot(f.vAxis) / f.vAxis.length();
  out.cos = c;
  out.elong = 1 + (Math.min(FEEL.maxElong, 1 / Math.max(c, 0.05)) - 1) * FEEL.slant;
  out.ang = Math.atan2(v, u);
  return out;
}
const slant = { elong: 1, ang: 0, cos: 1 };

export type ParticleKind = 'paint' | 'overspray' | 'spatter';

/** The paint one particle lands with, by kind, distance and slant. `base`: the cap's amount for this particle. */
export function landing(kind: ParticleKind, cap: CapSpec, base: number, distance: number, rect: Rect | undefined, dir: THREE.Vector3, rnd: () => number, out: Landing) {
  const t = farness(distance);
  let radius = (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
  let softness = THREE.MathUtils.lerp(Math.min(cap.softness, 0.1), Math.max(cap.softness, 0.6), t);
  let amount = base * THREE.MathUtils.lerp(FEEL.closeFlow, 1, t);
  let drips = cap.drips * THREE.MathUtils.lerp(FEEL.closeDrips, 1, t);
  if (FEEL.nib === 'needle') {
    radius *= 0.4;
    softness = 0.05;
    amount = Math.min(1, amount * 1.4);
  }
  let shape: DotShape | undefined;
  const s = slantShape(rect, dir, slant);
  if (s && FEEL.slant > 0) shape = [s.elong, s.ang, FEEL.tail * (1 - s.cos)];
  if (FEEL.nib === 'chisel' && rect?.face) {
    // A flat nib held at a fixed angle on the wall: its width depends on the stroke's direction.
    shape = [FEEL.chiselRatio * (s ? Math.sqrt(s.elong) : 1), (FEEL.chiselAngle * Math.PI) / 180, 0];
    radius = (cap.dotSize / 2) * 0.45;
    softness = 0.08;
  }
  if (kind === 'overspray') {
    // Overspray is single specks of paint, a texel or two, not a haze.
    radius = 0.002 + rnd() * 0.004;
    amount = rnd() < FEEL.oversprayAmount * 4 ? 0.5 + rnd() * 0.4 : 0;
    softness = 0;
    drips = 0;
    shape = undefined;
  } else if (kind === 'spatter') {
    radius = (cap.dotSize / 2) * FEEL.spatterSize * (0.4 + rnd() * 1.2);
    amount = 0.95;
    softness = 0.05;
    drips = cap.drips * 2;
    // A drop at a slant still splats long.
    if (s) shape = [Math.sqrt(s.elong) * (1 + rnd()), s.ang, 0.3];
  }
  out.amount = Math.min(1, amount);
  out.radius = radius;
  out.softness = softness;
  out.drips = drips;
  out.shape = shape;
  return out;
}

// --- Panel and hotkeys ---

const label = document.createElement('div');
/** Screen-space opacity gauge around the crosshair: an arc of the paint's color, a dot as dense as one pass. */
const gauge = document.createElement('div');
const gaugeDot = document.createElement('div');
const gaugeText = document.createElement('div');
let opacityChangedAt = -1;
let gui: GUI | null = null;

export function flash(text: string) {
  label.textContent = text;
  label.style.opacity = '1';
  clearTimeout((flash as { t?: number }).t);
  (flash as { t?: number }).t = window.setTimeout(() => (label.style.opacity = '0'), 1200);
}

export function initFeel() {
  Object.assign(label.style, {
    position: 'fixed', top: '30%', width: '100%', textAlign: 'center', font: 'bold 28px monospace',
    color: '#fff', textShadow: '0 0 6px #000, 0 0 2px #000', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.3s', zIndex: '9999',
  });
  document.body.appendChild(label);
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
    color: '#fff', textShadow: '0 0 2px #000', pointerEvents: 'none', zIndex: '9997', display: 'none',
  });
  document.body.append(gauge, gaugeDot, gaugeText);
  gui = new GUI({ title: 'ПЕСОЧНИЦА · баллон (Z)', width: 340 });
  gui.domElement.style.zIndex = '9998';
  gui.add(FEEL, 'on').name('включено');
  gui.add({ copy: copySettings }, 'copy').name('📋 Скопировать настройки');
  gui.add({ reset: resetSettings }, 'reset').name('↺ Сбросить настройки');
  gui.add(FEEL, 'showGap').name('прицел: дистанция');
  gui.add(FEEL, 'nib', NIBS as unknown as string[]).name('насадка (X)');
  // Smooth opacity, like a drawing app: the game's chunky alpha steps off (the panel brings them back).
  PAINT.alphaSteps = 0;
  gui.add(PAINT, 'alphaSteps', 0, 16, 1).name('ступени альфы');
  const br = gui.addFolder('Кисть');
  br.add(FEEL, 'brush').name('кисть');
  br.add(FEEL, 'opacity', 0.02, 1).name('нажим (Shift+колесо)');
  br.add(FEEL, 'spacing', 0.05, 1).name('шаг отпечатков');
  br.add(FEEL, 'streamline', 0, 1).name('сглаживание линии');
  br.add(FEEL, 'closeSoft', 0, 1).name('мягкость вблизи');
  br.add(FEEL, 'farSoft', 0, 1).name('мягкость вдали');
  br.add(FEEL, 'speedRef', 0, 4).name('скорость от, м/с');
  br.add(FEEL, 'speedFade', 0, 1.5).name('быстро: светлее');
  br.add(FEEL, 'speedWiden', 0, 2).name('быстро: шире');
  br.add(FEEL, 'speedSoft', 0, 1).name('быстро: мягче');
  const d = gui.addFolder('Дистанция');
  d.add(FEEL, 'gap', 0, 2.5, 0.05).name('зазор, м');
  d.add(FEEL, 'closeAt', 0.05, 1).name('«вблизи» до, м');
  d.add(FEEL, 'farAt', 0.5, 4.6).name('«вдали» от, м');
  d.add(FEEL, 'closeSize', 0.2, 1.5).name('размер вблизи');
  d.add(FEEL, 'farSize', 0.5, 5).name('размер вдали');
  d.add(FEEL, 'closeFlow', 0.5, 4).name('краски вблизи, ×');
  d.add(FEEL, 'closeDrips', 0, 20).name('подтёков вблизи, ×');
  const o = gui.addFolder('Пыль и брызги');
  o.add(FEEL, 'overspray', 0, 1.5).name('пыль: сколько');
  o.add(FEEL, 'oversprayCone', 1, 8).name('пыль: ширина');
  o.add(FEEL, 'oversprayAmount', 0, 0.3).name('пыль: плотность');
  o.add(FEEL, 'spatter', 0, 0.4).name('брызги вдали');
  o.add(FEEL, 'spatterLowPressure', 0, 1).name('брызги: мало давл.');
  o.add(FEEL, 'spatterSize', 0.1, 1.5).name('размер брызг');
  o.add(FEEL, 'spit', 0, 3).name('плевок в начале');
  o.add(FEEL, 'spitTime', 0, 0.4).name('плевок, с');
  o.add(FEEL, 'releaseTail', 0, 0.5).name('хвост, с');
  const s = gui.addFolder('Угол, насадка, жест');
  s.add(FEEL, 'slant', 0, 1).name('эллипс');
  s.add(FEEL, 'maxElong', 1, 8).name('эллипс: макс.');
  s.add(FEEL, 'tail', 0, 1).name('дальний край');
  s.add(FEEL, 'chiselRatio', 1.5, 10).name('chisel: вытянутость');
  s.add(FEEL, 'chiselAngle', 0, 180).name('chisel: угол, °');
  s.add(FEEL, 'speedThin', 0, 1).name('быстро: уже (частицы)');
  for (const c of gui.controllersRecursive()) {
    const tip = TIPS[c.property];
    if (tip) c.domElement.title = tip;
  }
  gui.hide();
  window.addEventListener('keydown', (e) => {
    // Not while typing a number into the panel.
    if (e.repeat || e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyZ') {
      if (gui!._hidden) gui!.show();
      else gui!.hide();
    } else if (e.code === 'KeyX') {
      FEEL.nib = NIBS[(NIBS.indexOf(FEEL.nib) + 1) % NIBS.length];
      flash(`NIB: ${FEEL.nib.toUpperCase()}`);
    } else return;
    refreshPanel();
  });
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

/** Hover tips for the panel: what each setting does to the paint, in plain words. */
const TIPS: Record<string, string> = {
  on: 'Все эксперименты песочницы. Выключи — баллон как в игре.',
  nib: 'Форма струи. round — обычная, chisel — плоское перо под углом (толщина зависит от направления), needle — тонкая игла.',
  alphaSteps: 'Ступени прозрачности краски. 0 — плавно, 8 — «рубленые» края, как в игре.',
  brush: 'Вкл — краска ложится сразу сплошным мазком. Выкл — её кладут летящие частицы (с задержкой и пробелами).',
  opacity: 'Насколько плотный мазок за один проход. Меньше — прозрачнее, слои складываются. Shift + колесо.',
  spacing: 'Как часто ставятся отпечатки вдоль мазка. Меньше — ровнее, больше — может пойти «бусами».',
  streamline: 'Сглаживание линии: кисть чуть догоняет прицел и съедает дрожь руки. 0 — без сглаживания.',
  closeSoft: 'Мягкость края мазка вплотную к стене. 0 — резкий край.',
  farSoft: 'Мягкость края мазка издалека. 1 — край растворяется.',
  speedRef: 'С какой скорости руки мазок начинает светлеть, шириться и мягчеть. Медленнее — плотно. 0 — выключить.',
  speedFade: 'Насколько светлее мазок при быстром движении.',
  speedWiden: 'Насколько шире мазок при быстром движении.',
  speedSoft: 'Насколько мягче край при быстром движении.',
  gap: 'До этой дистанции от стены кисть рисует как вплотную: узко и точно. Распыление начинается дальше.',
  closeAt: 'До какой дистанции (после зазора) считается «вплотную».',
  farAt: 'С какой дистанции (после зазора) распыление полное.',
  closeSize: 'Ширина пятна вплотную. Меньше — тоньше линия.',
  farSize: 'Ширина пятна издалека. Больше — шире распыление.',
  closeFlow: 'Сколько краски вплотную. Больше — плотнее и быстрее течёт.',
  closeDrips: 'Насколько чаще течёт краска вплотную.',
  reset: 'Вернуть все значения панели к начальным.',
  showGap: 'Под прицелом — расстояние до стены. Светлое — ты в зазоре (рисует точно), тусклое — дальше (распыление).',
  copy: 'Кладёт все значения панели в буфер обмена — вставь в чат.',
  overspray: 'Мелкие крапинки пыли вокруг линии. 0 — чистый край.',
  oversprayCone: 'Как далеко от линии разлетается пыль.',
  oversprayAmount: 'Насколько заметны крапинки пыли.',
  spatter: 'Крупные капли издалека. 0 — без капель.',
  spatterLowPressure: 'Капли, когда баллон почти пустой и ещё после отпускания. 0 — без них.',
  spatterSize: 'Размер капель.',
  spit: 'Клякса в самом начале нажатия. 0 — мазок начинается чисто.',
  spitTime: 'Сколько длится клякса в начале.',
  releaseTail: 'Сколько баллон ещё шипит после отпускания кнопки.',
  slant: 'Под углом к стене пятно вытягивается в эллипс. 0 — всегда круг.',
  maxElong: 'Насколько сильно может вытянуться пятно под углом.',
  tail: 'Дальний конец эллипса бледнее — для фэйдов поворотом.',
  chiselRatio: 'Насколько плоское перо chisel: больше — разница толстых и тонких линий сильнее.',
  chiselAngle: 'Наклон пера chisel на стене.',
  speedThin: 'Только для частиц: быстрый взмах сужает линию.',
};

/** Back to the values the game started with. */
function resetSettings() {
  Object.assign(FEEL, DEFAULTS);
  PAINT.alphaSteps = 0;
  refreshPanel();
  flash('НАСТРОЙКИ СБРОШЕНЫ');
}

/** Every panel value as JSON, to the clipboard: to paste into a chat. */
function copySettings() {
  const text = JSON.stringify({ FEEL, PAINT: { alphaSteps: PAINT.alphaSteps } }, null, 1);
  const done = () => flash('НАСТРОЙКИ СКОПИРОВАНЫ');
  navigator.clipboard?.writeText(text).then(done, () => fallbackCopy(text, done)) ?? fallbackCopy(text, done);
}
function fallbackCopy(text: string, done: () => void) {
  const area = document.createElement('textarea');
  area.value = text;
  document.body.appendChild(area);
  area.select();
  if (document.execCommand('copy')) done();
  else flash('НЕ ВЫШЛО: СМ. КОНСОЛЬ'), console.log(text);
  area.remove();
}

export function refreshPanel() {
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
}

/** Shift + wheel: the brush's opacity, in 5% steps. */
export function stepOpacity(steps: number) {
  FEEL.opacity = THREE.MathUtils.clamp(Math.round((FEEL.opacity - steps * 0.05) * 20) / 20, 0.05, 1);
  opacityChangedAt = performance.now() / 1000;
  refreshPanel();
}
