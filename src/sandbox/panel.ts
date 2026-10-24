import * as THREE from 'three';
import GUI, { type Controller } from 'lil-gui';
import { CAPS, DRIPS, PAINT, type CapId } from '../config';
import { initAim, flash, opacityChanged } from './aim';
import { DEFAULTS, FEEL, NIBS } from './feel';

// R&D sandbox: the panel (Z). Every setting has a dot for what it acts on and
// a tip in plain Russian. The cap group edits the cap in hand (config CAPS).

let gui: GUI | null = null;
let capFolder: GUI | null = null;
let capInHand: CapId = 'standard';

/** The cap in hand, as the panel edits it. */
const capView = {
  get spread() { return CAPS[capInHand].spread; },
  set spread(v: number) { CAPS[capInHand].spread = v; },
  get dotSize() { return CAPS[capInHand].dotSize; },
  set dotSize(v: number) { CAPS[capInHand].dotSize = v; },
  get softness() { return CAPS[capInHand].softness; },
  set softness(v: number) { CAPS[capInHand].softness = v; },
  get drips() { return CAPS[capInHand].drips; },
  set drips(v: number) { CAPS[capInHand].drips = v; },
  get drain() { return CAPS[capInHand].drain; },
  set drain(v: number) { CAPS[capInHand].drain = v; },
  get strength() { return CAPS[capInHand].strength; },
  set strength(v: number) { CAPS[capInHand].strength = v; },
};
const DRIP_KEYS = ['excess', 'dryTime', 'speed', 'minLength', 'maxLength', 'strength'] as const;

/** As the game started, for the reset. */
const CAP_DEFAULTS = structuredClone(CAPS);
const DRIP_DEFAULTS = { ...DRIPS };

/** What a setting acts on, as a dot before its name. */
type Scope = 'all' | 'cap' | 'own' | 'chisel' | 'particles';
const SCOPE_COLOR: Record<Scope, string> = { all: '#8a8a8a', cap: '#f2a04c', own: '#f0479a', chisel: '#36c2ea', particles: '#b98cf2' };
const SCOPE_WORD: Record<Scope, string> = { all: 'все кэпы', cap: 'зависит от кэпа', own: 'только этот кэп', chisel: 'chisel', particles: 'частицы' };
const SCOPE_TIP: Record<Scope, string> = {
  all: 'Серый: одинаково для всех кэпов.',
  cap: 'Оранжевый: общая, но умножается на значение кэпа (группа «Кэп в руке») — у кэпов эффект разный.',
  own: 'Розовый: только кэп в руке. Смени кэп (Q/E) — увидишь его значения.',
  chisel: 'Голубой: только насадка chisel.',
  particles: 'Фиолетовый: только режим частиц (галка «кисть» снята).',
};
const SCOPES: Partial<Record<string, Scope>> = {
  closeSoft: 'cap', farSoft: 'cap', closeSize: 'cap', farSize: 'cap', closeDrips: 'cap', oversprayCone: 'cap', spatterSize: 'cap',
  chiselRatio: 'chisel', chiselAngle: 'chisel', oversprayAmount: 'particles', speedThin: 'particles',
};
/** Settings without a dot (actions, the readout). */
const NO_SCOPE = new Set(['copy', 'reset', 'showGap']);

/** Hover tips: what each setting does to the paint, in plain words. */
const TIPS: Record<string, string> = {
  on: 'Все эксперименты песочницы. Выключи — баллон как в игре.',
  copy: 'Кладёт все значения панели (и кэпы, и подтёки) в буфер обмена — вставь в чат.',
  reset: 'Вернуть все значения панели, кэпов и подтёков к начальным.',
  showGap: 'Под прицелом — расстояние до стены. Светлое — ты в зазоре (рисует точно), тусклое — дальше (распыление).',
  nib: 'Форма струи. round — обычная, chisel — плоское перо под углом (толщина зависит от направления), needle — тонкая игла.',
  brush: 'Вкл — краска ложится сразу сплошным мазком. Выкл — её кладут летящие частицы (с задержкой и пробелами).',
  alphaSteps: 'Ступени прозрачности краски. 0 — плавно, 8 — «рубленые» края, как в игре.',
  opacity: 'Насколько плотный мазок за один проход. Меньше — прозрачнее, слои складываются. Shift + колесо.',
  spacing: 'Как часто ставятся отпечатки вдоль мазка. Меньше — ровнее, больше — может пойти «бусами».',
  streamline: 'Сглаживание линии: кисть чуть догоняет прицел и съедает дрожь руки. 0 — без сглаживания.',
  buildRate: 'Как быстро краска набирается, если держать баллон на месте (и быстрее потечёт).',
  gap: 'До этой дистанции от стены кисть рисует как вплотную: узко и точно. Распыление начинается дальше.',
  closeAt: 'До какой дистанции (после зазора) считается «вплотную».',
  farAt: 'С какой дистанции (после зазора) распыление полное.',
  closeSize: 'Ширина пятна вплотную. Меньше — тоньше линия.',
  farSize: 'Ширина пятна издалека. Больше — шире распыление.',
  closeSoft: 'Мягкость края мазка вплотную к стене. 0 — резкий край.',
  farSoft: 'Мягкость края мазка издалека. 1 — край растворяется.',
  closeFlow: 'Сколько краски вплотную. Больше — плотнее и быстрее течёт.',
  fadeStart: 'С какой дистанции (после зазора) мазок начинает бледнеть.',
  fadeMin: 'Насколько плотным остаётся мазок на самой дальней дистанции: 1 — не бледнеет, 0.5 — вдвое прозрачнее.',
  speedRef: 'С какой скорости руки мазок начинает светлеть, шириться и мягчеть. Медленнее — плотно. 0 — выключить.',
  speedFade: 'Насколько светлее мазок при быстром движении.',
  speedWiden: 'Насколько шире мазок при быстром движении.',
  speedSoft: 'Насколько мягче край при быстром движении.',
  closeDrips: 'Насколько чаще течёт краска вплотную.',
  spit: 'Клякса в самом начале нажатия. 0 — мазок начинается чисто.',
  spitTime: 'Сколько длится клякса в начале.',
  releaseTail: 'Сколько баллон ещё шипит после отпускания кнопки.',
  spatter: 'Крупные капли издалека. 0 — без капель.',
  spatterLowPressure: 'Капли, когда баллон почти пустой и ещё после отпускания. 0 — без них.',
  spatterSize: 'Размер капель.',
  overspray: 'Мелкие крапинки пыли вокруг линии. 0 — чистый край.',
  oversprayCone: 'Как далеко от линии разлетается пыль.',
  slant: 'Под углом к стене пятно вытягивается в эллипс. 0 — всегда круг.',
  maxElong: 'Насколько сильно может вытянуться пятно под углом.',
  tail: 'Дальний конец эллипса бледнее — для фэйдов поворотом.',
  chiselRatio: 'Насколько плоское перо chisel: больше — разница толстых и тонких линий сильнее.',
  chiselAngle: 'Наклон пера chisel на стене.',
  oversprayAmount: 'Насколько заметны крапинки пыли.',
  speedThin: 'Быстрый взмах сужает линию.',
};
const CAP_TIPS: Record<string, string> = {
  spread: 'Угол конуса: насколько быстро пятно растёт с дистанцией. Больше — шире издалека.',
  dotSize: 'Базовая ширина пятна. Меньше — тоньше линия на любой дистанции.',
  softness: 'Мягкость края этого кэпа. Стандартный — 0.35 (ползунки мягкости как есть); больше — мягче, меньше — резче.',
  drips: 'Как охотно течёт краска у этого кэпа.',
  drain: 'Как быстро падает давление (надо трясти, ПКМ).',
  strength: 'Плотность одной частицы. Кисть берёт плотность из «нажима», не отсюда.',
};
const DRIP_TIPS: Record<string, string> = {
  excess: 'Сколько слоёв краски должно лечь в одно место, чтобы потекло. Меньше — течёт раньше.',
  dryTime: 'Как быстро краска подсыхает и перестаёт течь, с.',
  speed: 'Скорость потёка вниз, м/с.',
  minLength: 'Самый короткий потёк, м.',
  maxLength: 'Самый длинный потёк, м.',
  strength: 'Насколько плотная полоска потёка.',
};

const dot = (scope: Scope) => {
  const d = document.createElement('span');
  Object.assign(d.style, { display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: SCOPE_COLOR[scope], marginRight: '6px', verticalAlign: 'middle' });
  return d;
};

function scopeOf(c: Controller): Scope | null {
  if (NO_SCOPE.has(c.property)) return null;
  if (c.object === capView) return 'own';
  if (c.object === DRIPS) return 'all';
  return SCOPES[c.property] ?? 'all';
}
const tipOf = (c: Controller) => (c.object === capView ? CAP_TIPS : c.object === DRIPS ? DRIP_TIPS : TIPS)[c.property];

export function initFeel() {
  initAim();
  // Smooth opacity, like a drawing app: the game's chunky alpha steps off (the panel brings them back).
  PAINT.alphaSteps = 0;
  gui = new GUI({ title: 'ПЕСОЧНИЦА · баллон (Z)', width: 340 });
  gui.domElement.style.zIndex = '9998';
  gui.add(FEEL, 'on').name('включено');
  gui.add({ copy: copySettings }, 'copy').name('📋 Скопировать настройки');
  gui.add({ reset: resetSettings }, 'reset').name('↺ Сбросить настройки');
  gui.add(FEEL, 'showGap').name('прицел: дистанция');
  gui.add(FEEL, 'nib', NIBS as unknown as string[]).name('насадка (X)');
  gui.add(FEEL, 'brush').name('кисть (иначе частицы)');
  gui.add(PAINT, 'alphaSteps', 0, 16, 1).name('ступени альфы');

  const br = gui.addFolder('Кисть');
  br.add(FEEL, 'opacity', 0.02, 1).name('нажим (Shift+колесо)');
  br.add(FEEL, 'spacing', 0.05, 1).name('шаг отпечатков');
  br.add(FEEL, 'streamline', 0, 1).name('сглаживание линии');
  br.add(FEEL, 'buildRate', 0, 120, 1).name('набор на месте');

  const d = gui.addFolder('Дистанция');
  d.add(FEEL, 'gap', 0, 2.5, 0.05).name('зазор, м');
  d.add(FEEL, 'closeAt', 0.05, 1).name('«вблизи» до, м');
  d.add(FEEL, 'farAt', 0.5, 4.6).name('«вдали» от, м');
  d.add(FEEL, 'closeSize', 0.2, 1.5).name('размер вблизи');
  d.add(FEEL, 'farSize', 0.5, 5).name('размер вдали');
  d.add(FEEL, 'closeSoft', 0, 1).name('мягкость вблизи');
  d.add(FEEL, 'farSoft', 0, 1).name('мягкость вдали');
  d.add(FEEL, 'closeFlow', 0.5, 4).name('краски вблизи, ×');
  d.add(FEEL, 'fadeStart', 0, 4).name('бледнеет от, м');
  d.add(FEEL, 'fadeMin', 0.1, 1).name('плотность вдали');

  const sp = gui.addFolder('Скорость руки');
  sp.add(FEEL, 'speedRef', 0, 4).name('скорость от, м/с');
  sp.add(FEEL, 'speedFade', 0, 1.5).name('быстро: светлее');
  sp.add(FEEL, 'speedWiden', 0, 2).name('быстро: шире');
  sp.add(FEEL, 'speedSoft', 0, 1).name('быстро: мягче');

  capFolder = gui.addFolder('');
  capFolder.add(capView, 'spread', 0.002, 0.2).name('ширина конуса');
  capFolder.add(capView, 'dotSize', 0.005, 0.3).name('размер точки, м');
  capFolder.add(capView, 'softness', 0, 1).name('мягкость');
  capFolder.add(capView, 'drips', 0, 100).name('подтёки');
  capFolder.add(capView, 'drain', 0, 0.3).name('расход давления');
  capFolder.add(capView, 'strength', 0, 1).name('плотность частицы');
  setCapInHand(capInHand, true);

  const dr = gui.addFolder('Подтёки').close();
  dr.add(DRIPS, 'excess', 1, 20).name('течёт после слоёв');
  dr.add(DRIPS, 'dryTime', 0.5, 10).name('высыхает, с');
  dr.add(DRIPS, 'speed', 0.02, 1).name('скорость, м/с');
  dr.add(DRIPS, 'minLength', 0.01, 0.5).name('длина от, м');
  dr.add(DRIPS, 'maxLength', 0.05, 1.5).name('длина до, м');
  dr.add(DRIPS, 'strength', 0.1, 1).name('плотность');
  dr.add(FEEL, 'closeDrips', 0, 20).name('вблизи, ×');

  const pr = gui.addFolder('Нажатие и брызги').close();
  pr.add(FEEL, 'spit', 0, 3).name('плевок в начале');
  pr.add(FEEL, 'spitTime', 0, 0.4).name('плевок, с');
  pr.add(FEEL, 'releaseTail', 0, 0.5).name('хвост, с');
  pr.add(FEEL, 'spatter', 0, 0.4).name('брызги вдали');
  pr.add(FEEL, 'spatterLowPressure', 0, 1).name('брызги: мало давл.');
  pr.add(FEEL, 'spatterSize', 0.1, 1.5).name('размер брызг');
  pr.add(FEEL, 'overspray', 0, 1.5).name('пыль: сколько');
  pr.add(FEEL, 'oversprayCone', 1, 8).name('пыль: ширина');

  const an = gui.addFolder('Угол и chisel').close();
  an.add(FEEL, 'slant', 0, 1).name('эллипс');
  an.add(FEEL, 'maxElong', 1, 8).name('эллипс: макс.');
  an.add(FEEL, 'tail', 0, 1).name('дальний край');
  an.add(FEEL, 'chiselRatio', 1.5, 10).name('chisel: вытянутость');
  an.add(FEEL, 'chiselAngle', 0, 180).name('chisel: угол, °');

  const pa = gui.addFolder('Частицы').close();
  pa.add(FEEL, 'oversprayAmount', 0, 0.3).name('пыль: плотность');
  pa.add(FEEL, 'speedThin', 0, 1).name('быстро: уже');

  for (const c of gui.controllersRecursive()) {
    const scope = scopeOf(c);
    if (scope) c.domElement.querySelector('.name')?.prepend(dot(scope));
    const tip = [tipOf(c), scope && SCOPE_TIP[scope]].filter(Boolean).join('\n');
    if (tip) c.domElement.title = tip;
  }
  const legend = document.createElement('div');
  Object.assign(legend.style, { padding: '4px 8px', fontSize: '11px', opacity: '0.75', lineHeight: '1.6' });
  for (const scope of Object.keys(SCOPE_WORD) as Scope[]) {
    const item = document.createElement('span');
    item.style.marginRight = '10px';
    item.style.whiteSpace = 'nowrap';
    item.append(dot(scope), SCOPE_WORD[scope]);
    legend.append(item);
  }
  gui.domElement.querySelector(':scope > .children')?.prepend(legend);
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

/** The cap group follows the cap in hand (called every frame the can is out). */
export function setCapInHand(cap: CapId, force = false) {
  if (cap === capInHand && !force) return;
  capInHand = cap;
  capFolder?.title(`Кэп в руке: ${CAPS[cap].name}`);
  refreshPanel();
}

/** Back to the values the game started with. */
function resetSettings() {
  Object.assign(FEEL, DEFAULTS);
  for (const id of Object.keys(CAPS) as CapId[]) Object.assign(CAPS[id], CAP_DEFAULTS[id]);
  Object.assign(DRIPS, DRIP_DEFAULTS);
  PAINT.alphaSteps = 0;
  refreshPanel();
  flash('НАСТРОЙКИ СБРОШЕНЫ');
}

/** Every panel value as JSON, to the clipboard: to paste into a chat. */
function copySettings() {
  const drips = Object.fromEntries(DRIP_KEYS.map((k) => [k, DRIPS[k]]));
  const caps = Object.fromEntries((Object.keys(CAPS) as CapId[]).map((id) => {
    const { spread, dotSize, softness, drips: d, drain, strength } = CAPS[id];
    return [id, { spread, dotSize, softness, drips: d, drain, strength }];
  }));
  const text = JSON.stringify({ FEEL, CAPS: caps, DRIPS: drips, PAINT: { alphaSteps: PAINT.alphaSteps } }, null, 1);
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
  opacityChanged();
  refreshPanel();
}
