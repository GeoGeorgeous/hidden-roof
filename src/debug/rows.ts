import { defaultOf } from './defaults';
import { hintFor, LABEL_HINTS } from './hints';
import { getValue, isChanged, setValue, type Item, type When } from './tuning';

// One row of the F3 panel per item: a slider, toggle, color, gray (a color as
// one shade, on a black-to-white slider), button, readout or heading. A value
// row is lit while it differs from config.ts, and its tooltip says config.ts's
// value; a slider marks it with a gray tick.

export interface Row {
  el: HTMLElement;
  /** Re-read the value from config. */
  sync?: () => void;
  /** Refresh a readout. */
  read?: () => void;
}

/** `edited` runs after the player changed the value. */
/** Row tags and tooltip lines for values whose change doesn't show at once (tuning.ts When). */
export const WHEN: Record<When, [tag: string, note: string]> = {
  release: ['LET GO', 'Applies when you let go of the slider.'],
  bake: ['BAKE', 'With baked light on, shows once the lamp light rebakes (a moment).'],
  build: ['BUILD', 'Shows only in build mode (B).'],
  paused: ['PAUSED', 'Shows only on the pause menu without F3 (close F3 and press ESC).'],
};

/** When a row's change shows, if not at once. */
export const whenOf = (it: Item): When | undefined => ('path' in it ? (it.when ?? (it.kind === 'range' && it.onRelease ? 'release' : undefined)) : undefined);

/** `tag`: show the When tag on the row (off when its section shows it once for all). */
export function itemRow(it: Item, edited: () => void, tag = true): Row {
  const row = control(it, edited);
  const w = whenOf(it);
  if (w && tag) row.el.querySelector('span')!.append(Object.assign(document.createElement('em'), { className: 'when', textContent: WHEN[w][0] }));
  const own = 'path' in it ? hintFor(it.path) : LABEL_HINTS[it.label];
  if (own) row.el.classList.add('has-hint');
  const hint = [own, w && WHEN[w][1]].filter(Boolean).join(' ');
  const d = 'path' in it ? defaultOf(it.path) : undefined;
  const tip = [hint, d === undefined ? '' : `config.ts: ${typeof d === 'boolean' ? (d ? 'ON' : 'OFF') : d}`].filter(Boolean).join('\n');
  if (tip) row.el.title = tip;
  return row;
}

function control(it: Item, edited: () => void): Row {
  const el = document.createElement('label');
  if (it.kind === 'heading') {
    el.className = 'heading';
    el.textContent = it.label;
    return { el };
  }
  if (it.kind === 'action') {
    el.className = 'readout-row';
    const b = document.createElement('button');
    b.textContent = it.label;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      it.run();
    });
    el.append(b);
    return { el };
  }
  const name = Object.assign(document.createElement('span'), { textContent: it.label });
  const value = document.createElement('b');
  if (it.kind === 'readout') {
    el.className = 'readout-row';
    el.append(name, value);
    return { el, read: () => (value.textContent = it.get()) };
  }
  const input = document.createElement('input');
  let control: HTMLElement = input;
  let show: () => void;
  let read: () => unknown;
  if (it.kind === 'color') {
    input.type = 'color';
    show = () => {
      input.value = String(getValue(it.path));
      value.textContent = input.value;
    };
    read = () => input.value;
  } else if (it.kind === 'gray') {
    input.type = 'range';
    Object.assign(input, { min: '0', max: '255', step: '1' });
    show = () => {
      const hex = String(getValue(it.path));
      input.value = String(grayOf(hex));
      value.textContent = hex;
    };
    read = () => `#${Number(input.value).toString(16).padStart(2, '0').repeat(3)}`;
    const d = defaultOf(it.path);
    control = withDefaultTick(input, typeof d === 'string' ? grayOf(d) : undefined, 0, 255);
    control.classList.add('gray');
  } else if (it.kind === 'toggle') {
    input.type = 'checkbox';
    show = () => {
      input.checked = !!getValue(it.path);
      value.textContent = input.checked ? 'ON' : 'OFF';
    };
    read = () => input.checked;
  } else {
    input.type = 'range';
    Object.assign(input, { min: String(it.min), max: String(it.max), step: String(it.step) });
    const digits = Math.max(0, -Math.floor(Math.log10(it.step)));
    show = () => {
      const v = getValue(it.path) as number;
      input.value = String(v);
      value.textContent = v.toFixed(digits);
    };
    read = () => Number(input.value);
    control = withDefaultTick(input, defaultOf(it.path), it.min, it.max);
    if (it.onRelease) input.addEventListener('change', it.onRelease);
  }
  const sync = () => {
    show();
    el.classList.toggle('changed', isChanged(it));
  };
  input.addEventListener(it.kind === 'toggle' ? 'change' : 'input', () => {
    setValue(it.path, read());
    sync();
    it.onChange?.();
    edited();
  });
  sync();
  el.append(name, control, value);
  return { el, sync };
}

/** A hex color's gray level, 0..255 (the mean of its channels). */
function grayOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return Math.round(((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3);
}

/** The slider over a gray tick at config.ts's value (none when that is off the scale). */
function withDefaultTick(input: HTMLInputElement, d: unknown, min: number, max: number) {
  const box = document.createElement('span');
  box.className = 'slider';
  if (typeof d === 'number' && d >= min && d <= max) {
    const tick = document.createElement('i');
    tick.style.setProperty('--at', String((d - min) / (max - min)));
    box.append(tick);
  }
  box.append(input);
  return box;
}
