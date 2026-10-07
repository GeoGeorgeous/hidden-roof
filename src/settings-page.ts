import type { SettingRow, SettingSection } from './settings';

// The settings page of the pause menu: one tab per section (gameplay,
// graphics, sound), each row a choice (< and > step to the previous and next
// value) or a slider, with, for some, a short
// description, a performance cost (LOW, MEDIUM, HIGH: green to red) and a
// callout (recommendations). Values are read again whenever the page opens,
// since the debug panel edits the same settings.

export class SettingsPage {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private syncs: (() => void)[] = [];

  constructor(
    private sections: SettingSection[],
    onBack: () => void,
  ) {
    this.root = div('settings-page');
    const head = div('tabs');
    sections.forEach((s, i) => {
      const b = button(s.title, () => this.show(i));
      this.tabs.push(b);
      head.append(b);
    });
    this.body = div('rows');
    const back = button('< BACK', onBack);
    back.className = 'back';
    this.root.append(head, this.body, back);
    this.show(0);
  }

  /** Re-read every value (the debug panel may have changed them). */
  sync() {
    for (const s of this.syncs) s();
  }

  private show(i: number) {
    this.tabs.forEach((b, k) => b.classList.toggle('on', k === i));
    this.body.innerHTML = '';
    this.syncs = [];
    for (const row of this.sections[i].rows) this.body.append(this.rowEl(row));
    this.sync();
  }

  private rowEl(row: SettingRow) {
    const el = div('setting-row');
    const line = div('line');
    line.append(Object.assign(div('label'), { textContent: row.label }));
    if (row.kind === 'choice') {
      const value = div('choice');
      const step = (d: number) => {
        row.step(d);
        this.sync();
      };
      line.append(button('<', () => step(-1)), value, button('>', () => step(1)));
      this.syncs.push(() => (value.textContent = row.value()));
    } else {
      const input = Object.assign(document.createElement('input'), { type: 'range', min: `${row.min}`, max: `${row.max}`, step: `${row.step}` });
      const out = div('value');
      const sync = () => {
        input.value = `${row.get()}`;
        out.textContent = row.format(row.get());
      };
      input.addEventListener('input', () => {
        row.set(+input.value);
        this.sync();
      });
      line.append(input, out);
      this.syncs.push(sync);
    }
    el.append(line);
    if (row.desc) el.append(Object.assign(div('desc'), { textContent: row.desc }));
    if (row.cost) el.append(Object.assign(div(`cost ${row.cost.toLowerCase()}`), { innerHTML: `PERFORMANCE COST: <b>${row.cost}</b>` }));
    if (row.note) el.append(Object.assign(div('note'), { textContent: row.note }));
    return el;
  }
}

function div(className: string) {
  return Object.assign(document.createElement('div'), { className });
}

function button(text: string, onClick: () => void) {
  const b = Object.assign(document.createElement('button'), { textContent: text });
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.button === 0) onClick();
  });
  return b;
}
