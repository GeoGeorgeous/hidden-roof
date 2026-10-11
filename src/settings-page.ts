import { button, div, segmented } from './menu-ui';
import type { SettingRow, SettingSection } from './settings';

// The Settings page of the ESC menu: one tab per section (gameplay, graphics,
// sound), each row a choice (‹ and › step to the previous and next value) or
// a slider with a gray tick at its default (Shift + click goes back to it),
// with, for some, a short description, a performance cost (one to three dots
// after its name) and a callout (recommendations). Values are read again
// whenever the page opens, since the debug panel edits the same settings.
// The multiplayer page builds its rows with the same pieces.

/** Performance cost after a setting's name: one dot (LOW) to three (HIGH). */
const COST_DOTS = { LOW: '●○○', MEDIUM: '●●○', HIGH: '●●●' };

export class SettingsPage {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private tabs: ReturnType<typeof segmented>;
  private syncs: (() => void)[] = [];

  constructor(private sections: SettingSection[]) {
    this.root = div('page settings-page');
    this.tabs = segmented(
      sections.map((s) => s.title),
      (i) => this.show(i),
    );
    this.tabs.el.classList.add('tabs');
    this.body = div('rows');
    const foot = div('foot');
    foot.innerHTML = '<span>Performance cost:&nbsp; ●○○ low · ●●○ medium · ●●● high</span><i>·</i><span>Shift + click a slider to reset it</span>';
    this.root.append(pageHead('settings', this.tabs.el), this.body, foot);
    this.show(0);
  }

  /** Re-read every value (the debug panel may have changed them). */
  sync() {
    for (const s of this.syncs) s();
  }

  show(i: number) {
    this.tabs.set(i);
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    this.syncs = [];
    for (const row of this.sections[i].rows) this.body.append(this.rowEl(row));
    this.sync();
  }

  private rowEl(row: SettingRow) {
    if (row.kind === 'choice') {
      const c = choice(row.value, (d) => (row.step(d), this.sync()), row.locked);
      this.syncs.push(c.sync);
      return settingRow(row.label, c.el, row);
    }
    const input = Object.assign(document.createElement('input'), { type: 'range', min: `${row.min}`, max: `${row.max}`, step: `${row.step}` });
    const out = div('value');
    const sync = () => {
      input.value = `${row.get()}`;
      input.style.setProperty('--fill', `${((row.get() - row.min) / (row.max - row.min)) * 100}%`);
      out.textContent = row.format(row.get());
    };
    input.addEventListener('input', () => {
      row.set(+input.value);
      this.sync();
    });
    // Shift + click: back to the default.
    input.addEventListener('pointerdown', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      row.set(row.def);
      this.sync();
    });
    input.title = 'Shift + click to reset';
    this.syncs.push(sync);
    const el = div('range');
    el.append(withDefaultTick(input, row.def, row.min, row.max), out);
    return settingRow(row.label, el, row);
  }
}

/** A page's title, centered at the top, with what goes under it (the tabs, a subtitle). */
export function pageHead(title: string, ...under: HTMLElement[]) {
  const el = div('page-head');
  el.append(div('page-title', title), ...under);
  return el;
}

/** A row: its name (and cost), the control on the right, then its description and callout. */
export function settingRow(label: string, control: HTMLElement, { desc, note, cost }: { desc?: string; note?: string; cost?: keyof typeof COST_DOTS } = {}) {
  const el = div('setting-row');
  const line = div('line');
  const name = div('label');
  name.append(Object.assign(document.createElement('span'), { textContent: label }));
  if (cost) name.append(Object.assign(document.createElement('span'), { className: 'cost', title: `Performance cost: ${cost.toLowerCase()}`, textContent: COST_DOTS[cost] }));
  line.append(name, control);
  el.append(line);
  if (desc) el.append(div('desc', desc));
  if (note) el.append(div('note', note));
  return el;
}

/** ‹ value ›: `step` goes to the next value (+1) or the previous (-1); `locked`: greyed out, the arrows do nothing. */
export function choice(value: () => string, step: (d: number) => void, locked?: () => boolean) {
  const el = div('choice');
  const out = div('value');
  const go = (d: number) => () => {
    if (locked?.()) return;
    step(d);
    sync();
  };
  const sync = () => {
    out.textContent = value();
    el.classList.toggle('locked', !!locked?.());
  };
  el.append(button('‹', go(-1)), out, button('›', go(1)));
  sync();
  return { el, sync };
}

/** The slider over a gray tick at its default (none when that is off the scale); the debug panel's sliders too. */
export function withDefaultTick(input: HTMLInputElement, d: unknown, min: number, max: number) {
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
