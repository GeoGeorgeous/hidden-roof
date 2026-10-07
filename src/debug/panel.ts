import { icon, sectionIcon } from './icons';
import { paintSections } from './paint-sections';
import { itemSections } from './item-sections';
import { renderSections, uiSections } from './render-sections';
import { soundSections } from './sound-sections';
import { buildSections } from './build-sections';
import { playSections } from './play-sections';
import { itemRow, type Row } from './rows';
import { isChanged, isValue, resetItems, sectionsJSON, splitSections, type Section } from './tuning';
import { worldSections } from './world-sections';

// Debug panel (F3 / `): tabs of groups of small collapsible sections of live
// tunables and stats. RESET puts config.ts's values back without saving
// anything (a slider's gray tick marks that value), COPY gives JSON that maps
// onto config.ts; both per section and for everything. Changed values are lit
// and their sections and tabs marked. COLLAPSE / EXPAND ALL act on the open
// tab. The open tab and sections are remembered in this browser. DevTools
// frees the mouse when the panel opens; Esc goes between game and panel.

const OPEN_KEY = 'roofhiddenhaus.debug.open';
const TAB_KEY = 'roofhiddenhaus.debug.tab';
const CONFIRM_SECONDS = 2;

/** The groups (authored sections, by id) on each tab; a group not listed goes on the last tab. */
const TABS = [
  { id: 'player', title: 'Player', groups: ['movement', 'camera', 'hands', 'held', 'avatar'] },
  { id: 'paint', title: 'Paint', groups: ['painting', 'caps', 'runs', 'pressure', 'quality', 'cursor'] },
  { id: 'render', title: 'Render', groups: ['shaders', 'lighting', 'light-props', 'post'] },
  { id: 'world', title: 'World', groups: ['weather', 'props', 'city'] },
  { id: 'sound', title: 'Sound', groups: ['mix', 'weather-sound', 'spray-sound', 'props-sound'] },
  { id: 'ui', title: 'UI', groups: ['hud', 'pause'] },
  { id: 'build', title: 'Build', groups: ['daylight', 'editing'] },
  { id: 'items', title: 'Items', groups: ['pickups'] },
  { id: 'models', title: 'Models', groups: ['can', 'cap-models', 'marker', 'ladder', 'roller', 'sponge'] },
  { id: 'test', title: 'Test', groups: ['performance', 'avatar-test', 'ghost'] },
];

interface Part {
  s: Section;
  head: HTMLElement;
  setOpen: (open: boolean) => void;
}

interface Page {
  id: string;
  tab: HTMLElement;
  el: HTMLElement;
  parts: Part[];
}

const groupOf = (s: Section) => s.id.split(':')[0];

export class DebugPanel {
  visible = false;
  private root: HTMLElement;
  private rows: Row[] = [];
  private readouts: (() => void)[] = [];
  private list: Section[];
  private pages: Page[] = [];
  private page!: Page;
  private openIds: Set<string>;

  constructor() {
    this.list = splitSections([...playSections(), ...paintSections(), ...renderSections(), ...worldSections(), ...soundSections(), ...uiSections(), ...buildSections(), ...itemSections()]);
    this.openIds = loadOpen() ?? new Set(this.list.filter((s) => s.open).map((s) => s.id));
    this.root = el('div', 'debug-panel');
    this.root.hidden = true;
    const top = el('div', 'row');
    top.append(
      confirmButton('RESET ALL', () => this.reset(this.list)),
      button('COLLAPSE ALL', () => this.setAll(false)),
      button('EXPAND ALL', () => this.setAll(true)),
      copyButton('COPY ALL', () => sectionsJSON(this.list)),
    );
    const tabs = el('div', 'tabs');
    const body = el('div', 'pages');
    const at = (s: Section) => {
      const g = groupOf(s);
      const t = TABS.findIndex((tab) => tab.groups.includes(g));
      return t < 0 ? [TABS.length - 1, Infinity] : [t, TABS[t].groups.indexOf(g)];
    };
    for (const t of TABS) {
      const page: Page = { id: t.id, tab: button('', () => this.show(page)), el: el('div', 'page'), parts: [] };
      page.tab.classList.add('tab');
      page.tab.append(icon(t.id), t.title.toUpperCase());
      tabs.append(page.tab);
      body.append(page.el);
      this.pages.push(page);
    }
    // Stable sort: sections keep their order within a group.
    const placed = this.list.map((s) => ({ s, at: at(s) })).sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
    let group = '';
    for (const { s, at } of placed) {
      const page = this.pages[at[0]];
      if (groupOf(s) !== group) {
        group = groupOf(s);
        const head = el('div', 'group');
        head.append(icon(group), (s.group ?? '').toUpperCase());
        page.el.append(head);
      }
      page.parts.push(this.section(s, page.el));
    }
    const hint = Object.assign(el('div', 'hint'), { textContent: 'ESC: GAME / PANEL · F3: CLOSE' });
    this.root.append(top, tabs, hint, body);
    this.show(this.pages.find((p) => p.id === load(TAB_KEY)) ?? this.pages[0]);
    this.refresh();
    document.body.appendChild(this.root);
  }

  toggle() {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    this.sync();
  }

  /** Re-read every value after config changed elsewhere (e.g. a lighting preset). */
  sync() {
    for (const r of this.rows) r.sync?.();
    this.refresh();
  }

  /** Refresh readouts (cheap; only while visible). */
  update() {
    if (!this.visible) return;
    for (const read of this.readouts) read();
  }

  private show(page: Page) {
    this.page = page;
    for (const p of this.pages) {
      p.el.hidden = p !== page;
      p.tab.classList.toggle('on', p === page);
    }
    save(TAB_KEY, page.id);
  }

  private reset(list: Section[]) {
    resetItems(list.flatMap((s) => s.items));
    this.sync();
  }

  /** Marks the sections and tabs holding values that differ from config.ts. */
  private refresh() {
    for (const p of this.pages) {
      let any = false;
      for (const part of p.parts) {
        const changed = part.s.items.some((it) => isValue(it) && isChanged(it));
        part.head.classList.toggle('changed', changed);
        any ||= changed;
      }
      p.tab.classList.toggle('changed', any);
    }
  }

  private setAll(open: boolean) {
    for (const part of this.page.parts) part.setOpen(open);
    this.saveOpen();
  }

  private saveOpen() {
    save(OPEN_KEY, JSON.stringify([...this.openIds]));
  }

  private section(s: Section, into: HTMLElement): Part {
    const box = el('section');
    const head = el('div', 'head');
    const title = el('span', 'title');
    const arrow = el('span', 'arrow');
    const body = el('div', 'body');
    let open = this.openIds.has(s.id);
    const render = () => {
      arrow.textContent = open ? '▾' : '▸';
      body.hidden = !open;
      if (open) this.openIds.add(s.id);
      else this.openIds.delete(s.id);
    };
    title.addEventListener('click', () => {
      open = !open;
      render();
      this.saveOpen();
    });
    render();
    title.append(arrow, icon(sectionIcon(s.title)), s.title.toUpperCase());
    head.append(title);
    if (s.disabled) {
      box.classList.add('disabled');
      body.inert = true;
      head.append(Object.assign(el('span', 'hint'), { textContent: 'DISABLED' }));
    } else if (s.items.some(isValue)) {
      const reset = button('RESET', () => this.reset([s]));
      reset.classList.add('reset');
      head.append(copyButton('COPY', () => sectionsJSON([s])), reset);
    }
    for (const it of s.items) {
      const row = itemRow(it, () => this.refresh());
      this.rows.push(row);
      if (row.read) this.readouts.push(row.read);
      body.append(row.el);
    }
    box.append(head, body);
    into.append(box);
    return {
      s,
      head,
      setOpen: (v) => {
        open = v;
        render();
      },
    };
  }
}

function el(tag: string, className = '') {
  return Object.assign(document.createElement(tag), { className });
}

function button(label: string, run: () => void) {
  const b = el('button') as HTMLButtonElement;
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    run();
  });
  return b;
}

/** Runs on a second click within a few seconds (the first asks SURE?). */
function confirmButton(label: string, run: () => void) {
  let armed = 0;
  const b = button(label, () => {
    if (armed) {
      clearTimeout(armed);
      armed = 0;
      b.textContent = label;
      run();
      return;
    }
    b.textContent = 'SURE?';
    armed = window.setTimeout(() => {
      armed = 0;
      b.textContent = label;
    }, CONFIRM_SECONDS * 1000);
  });
  return b;
}

function copyButton(label: string, text: () => string) {
  const b = button(label, async () => {
    const t = text();
    try {
      await navigator.clipboard.writeText(t);
      b.textContent = 'COPIED';
    } catch {
      window.prompt('Copy these values:', t);
    }
    setTimeout(() => (b.textContent = label), 1500);
  });
  return b;
}

function load(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the panel just isn't remembered.
  }
}

function loadOpen(): Set<string> | null {
  try {
    const v = load(OPEN_KEY) ?? load('taggin.debug.open');
    return v ? new Set(JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}
