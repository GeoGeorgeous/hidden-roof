import { hintFor, LABEL_HINTS } from './hints';
import { getValue, sections, sectionsJSON, setValue, splitSections, type Item, type Section } from './tuning';

// Debug panel (F3 / `): groups of small collapsible sections of live tunables
// and stats. Each section has its own "copy", plus "copy all"; collapse all /
// expand all; open sections are remembered in this browser. Press Esc to free
// the mouse and use the sliders; click the game to resume.

const OPEN_KEY = 'taggin.debug.open';

export class DebugPanel {
  visible = false;
  private root: HTMLElement;
  private readouts: { el: HTMLElement; get: () => string }[] = [];
  private syncers: (() => void)[] = [];
  private list: Section[];
  private openers = new Map<string, (open: boolean) => void>();
  private openIds: Set<string>;

  constructor() {
    this.list = splitSections(sections());
    this.openIds = loadOpen() ?? new Set(this.list.filter((s) => s.open).map((s) => s.id));
    this.root = document.createElement('div');
    this.root.className = 'debug-panel';
    this.root.hidden = true;
    const top = document.createElement('div');
    top.className = 'row';
    top.append(
      copyButton('COPY ALL', () => sectionsJSON(this.list)),
      actionButton('COLLAPSE ALL', () => this.setAll(false)),
      actionButton('EXPAND ALL', () => this.setAll(true)),
      Object.assign(document.createElement('span'), { className: 'hint', textContent: 'ESC FREES THE MOUSE' }),
    );
    this.root.append(top);
    let group = '';
    for (const s of this.list) {
      if (s.group && s.group !== group) {
        group = s.group;
        this.root.append(Object.assign(document.createElement('div'), { className: 'group', textContent: group.toUpperCase() }));
      }
      this.root.append(this.section(s));
    }
    document.body.appendChild(this.root);
  }

  toggle() {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    this.sync();
  }

  /** Re-read slider values after config changed elsewhere (e.g. a lighting preset). */
  sync() {
    for (const s of this.syncers) s();
  }

  private setAll(open: boolean) {
    for (const set of this.openers.values()) set(open);
    this.saveOpen();
  }

  private saveOpen() {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...this.openIds]));
    } catch {
      // Storage unavailable: open sections are just not remembered.
    }
  }

  /** Refresh readouts (cheap; only while visible). */
  update() {
    if (!this.visible) return;
    for (const r of this.readouts) r.el.textContent = r.get();
  }

  private section(s: Section) {
    const box = document.createElement('section');
    const head = document.createElement('div');
    head.className = 'head';
    const title = document.createElement('span');
    title.className = 'title';
    const body = document.createElement('div');
    body.className = 'body';
    let open = this.openIds.has(s.id);
    const render = () => {
      title.textContent = `${open ? '▾' : '▸'} ${s.title.toUpperCase()}`;
      body.hidden = !open;
      if (open) this.openIds.add(s.id);
      else this.openIds.delete(s.id);
    };
    this.openers.set(s.id, (v) => {
      open = v;
      render();
    });
    title.addEventListener('click', () => {
      open = !open;
      render();
      this.saveOpen();
    });
    render();
    const copyable = s.items.some((i) => i.kind === 'range' || i.kind === 'toggle' || i.kind === 'color');
    head.append(title);
    if (copyable) head.append(copyButton('COPY', () => sectionsJSON([s])));
    for (const it of s.items) body.append(this.item(it));
    box.append(head, body);
    return box;
  }

  private item(it: Item): HTMLElement {
    const row = this.row(it);
    const hint = 'path' in it ? hintFor(it.path) : LABEL_HINTS[it.label];
    if (hint) {
      row.title = hint;
      row.classList.add('has-hint');
    }
    return row;
  }

  private row(it: Item): HTMLElement {
    const row = document.createElement('label');
    if (it.kind === 'heading') {
      row.className = 'heading';
      row.textContent = it.label;
      return row;
    }
    if (it.kind === 'action') {
      row.className = 'readout-row';
      const b = document.createElement('button');
      b.textContent = it.label;
      b.addEventListener('click', (e) => {
        e.preventDefault();
        it.run();
      });
      row.append(b);
      return row;
    }
    if (it.kind === 'readout') {
      row.className = 'readout-row';
      const v = document.createElement('b');
      row.append(Object.assign(document.createElement('span'), { textContent: it.label }), v);
      this.readouts.push({ el: v, get: it.get });
      return row;
    }
    const name = Object.assign(document.createElement('span'), { textContent: it.label });
    const value = document.createElement('b');
    const input = document.createElement('input');
    if (it.kind === 'color') {
      input.type = 'color';
      const sync = () => {
        input.value = String(getValue(it.path));
        value.textContent = input.value;
      };
      input.addEventListener('input', () => {
        setValue(it.path, input.value);
        sync();
        it.onChange?.();
      });
      this.syncers.push(sync);
      sync();
    } else if (it.kind === 'toggle') {
      input.type = 'checkbox';
      const sync = () => {
        input.checked = !!getValue(it.path);
        value.textContent = input.checked ? 'ON' : 'OFF';
      };
      input.addEventListener('change', () => {
        setValue(it.path, input.checked);
        sync();
        it.onChange?.();
      });
      this.syncers.push(sync);
      sync();
    } else {
      input.type = 'range';
      Object.assign(input, { min: String(it.min), max: String(it.max), step: String(it.step) });
      const digits = Math.max(0, -Math.floor(Math.log10(it.step)));
      const sync = () => {
        const v = getValue(it.path) as number;
        input.value = String(v);
        value.textContent = v.toFixed(digits);
      };
      input.addEventListener('input', () => {
        setValue(it.path, Number(input.value));
        sync();
        it.onChange?.();
      });
      this.syncers.push(sync);
      sync();
    }
    row.append(name, input, value);
    return row;
  }
}

function copyButton(label: string, text: () => string) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
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

function actionButton(label: string, run: () => void) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    run();
  });
  return b;
}

function loadOpen(): Set<string> | null {
  try {
    const v = localStorage.getItem(OPEN_KEY);
    return v ? new Set(JSON.parse(v) as string[]) : null;
  } catch {
    return null;
  }
}

