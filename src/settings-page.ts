import { action, choice, div, el, pageHead, relabel, segmented, settingRow, withDefaultTick } from './menu-ui';
import type { OwnTab, SettingRow, SettingSection } from './settings';

/** An action's confirmation shows on its button this long (ms), like "Copied". */
const DONE_MS = 2500;

// The Settings page of the ESC menu: one tab per section (gameplay, graphics,
// sound), each row a choice (‹ and › step to the previous and next value), a
// value to read (the GPU), a button (the performance test) or a slider with a gray tick at its default (Shift + click goes back to it),
// with, for some, a short description, a performance cost (one to three dots
// after its name) and a callout (recommendations). Values are read again
// whenever the page opens, since the debug panel edits the same settings.
// The multiplayer page builds its rows with the same pieces (menu-ui.ts). A tab can build
// its own page instead (Controls, controls-tab.ts): its rows, footer line and
// a control top right.

export class SettingsPage {
  readonly root: HTMLElement;
  private body: HTMLElement;
  private tabs: ReturnType<typeof segmented>;
  private foot: HTMLElement;
  private costs: HTMLElement[];
  private corner = div('page-corner');
  /** The open tab's own page, if it has one. */
  private own: OwnTab | undefined;
  private syncs: (() => void)[] = [];

  constructor(private sections: SettingSection[]) {
    this.root = div('page settings-page');
    this.tabs = segmented(
      sections.map((s) => s.title),
      (i) => this.show(i),
    );
    this.tabs.el.classList.add('tabs');
    this.body = div('rows');
    this.foot = div('foot');
    this.foot.innerHTML = '<span>Performance cost:&nbsp; ●○○ low · ●●○ medium · ●●● high</span><i>·</i><span>Shift + click a slider to reset it</span>';
    this.costs = [...this.foot.children] as HTMLElement[];
    this.root.append(pageHead('settings', this.tabs.el), this.corner, this.body, this.foot);
    this.show(0);
  }

  /** The tab with this title; `row`: scrolled to the row with this label (back from the performance test). */
  showTab(title: string, row?: string) {
    this.show(this.sections.findIndex((s) => s.title === title));
    if (row) [...this.body.querySelectorAll('.setting-row')].find((el) => el.querySelector('.label span')?.textContent === row)?.scrollIntoView({ block: 'nearest' });
  }

  /** Re-read every value (the debug panel may have changed them). */
  sync() {
    for (const s of this.syncs) s();
  }

  show(i: number) {
    this.tabs.set(i);
    this.own?.close();
    this.own = this.sections[i].tab;
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    this.body.classList.toggle('own', !!this.own);
    this.syncs = [];
    for (const row of this.sections[i].rows) this.body.append(this.rowEl(row));
    if (this.own) {
      this.body.append(this.own.rows);
      this.foot.replaceChildren(this.own.foot);
      this.corner.replaceChildren(this.own.corner);
      this.own.open();
    } else {
      this.foot.replaceChildren(...this.costs);
      this.corner.replaceChildren();
    }
    this.sync();
  }

  private rowEl(row: SettingRow) {
    if (row.kind === 'choice') {
      const c = choice(row.value, (d) => (row.step(d), this.sync()), row.locked);
      this.syncs.push(c.sync);
      return settingRow(row.label, c.el, row);
    }
    if (row.kind === 'info') {
      const out = div('info-value');
      this.syncs.push(() => (out.textContent = row.value()));
      return settingRow(row.label, out, row);
    }
    if (row.kind === 'action') {
      // Under a choice's value: its edges line up with the values in the rows below.
      const cell = div('action-cell');
      const button = action(row.button, () => {
        row.act();
        this.sync();
        if (!row.done) return;
        relabel(button, row.done);
        clearTimeout(done);
        done = window.setTimeout(() => relabel(button, row.button), DONE_MS);
      });
      let done = 0;
      if (row.enabled) this.syncs.push(() => (button.disabled = !row.enabled!()));
      cell.append(button);
      return settingRow(row.label, cell, row);
    }
    const input = Object.assign(el('input'), { type: 'range', min: `${row.min}`, max: `${row.max}`, step: `${row.step}` });
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
    const box = div('range');
    box.append(withDefaultTick(input, row.def, row.min, row.max), out);
    return settingRow(row.label, box, row);
  }
}
