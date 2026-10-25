import { COLORS, SERVER } from '../config';
import type { Tool } from '../inventory/tool';
import { pickFile } from '../files';
import { msg } from '../messages';
import { aboutSize, action, button, div, el, popup, relabel, sentence } from '../menu-ui';
import { SESSION_NAME_MAX } from './protocol';
import { toolIcon, TOOLS, TOOL_NAMES } from './tool-icons';

// The "new session" dialog: a name, how many players, the tools it allows and
// what the roof starts from. The caller mounts the returned element like the
// other popups (menu.addPage) and answers Esc with `cancel`; Enter runs Create
// (menu-ui.ts runPrimary). `create` gets the choices: `tools` are the ones left
// on, in slot order; `file` the picked paint save, or null for an empty roof.
// While it runs the button reads "Creating…"; if it rejects, the message shows
// under the options and the dialog stays open for another try.

export interface NewSession {
  name: string;
  limit: number;
  tools: Tool[];
  file: File | null;
}

// Tabler outline icons (MIT, Paweł Kuna; public/licenses/tabler-icons.txt) on a 24 px grid, drawn in the text color.
const ICONS = {
  minus: '<path d="M5 12l14 0"/>',
  plus: '<path d="M12 5l0 14"/><path d="M5 12l14 0"/>',
  'file-upload': '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/><path d="M12 11v6"/><path d="M9.5 13.5l2.5 -2.5l2.5 2.5"/>',
  'file-check': '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/><path d="M9 15l2 2l4 -4"/>',
};

function icon(name: keyof typeof ICONS) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

/** The dots' colors, one per seat. */
const SEATS = [COLORS.red, COLORS.cyan, COLORS.yellow, COLORS.green];

/** A label row: what it is on the left, its state on the right. */
function labelRow(label: string) {
  const row = div('create-label');
  const state = el('span');
  row.append(el('span', '', label), state);
  return { row, state };
}

export function createDialog(opts: { create(s: NewSession): Promise<void>; cancel(): void }): HTMLElement {
  const { min, max } = { min: SERVER.privateMin, max: SERVER.players.private };
  let limit = max;
  const off = new Set<Tool>();
  let fromFile = false;
  let file: File | null = null;
  let fileError = false;
  let busy = false;

  const ui = popup('new session');
  ui.root.firstElementChild!.classList.add('create-popup');

  // Name
  const name = el('input', 'create-name');
  name.type = 'text';
  name.maxLength = SESSION_NAME_MAX;
  name.spellcheck = false;
  name.placeholder = 'Name your session';
  const nameLabel = labelRow('Name');
  const nameBox = div('create-field');
  nameBox.append(nameLabel.row, name);

  // Players
  const dots = SEATS.slice(0, max).map(() => el('i'));
  dots.forEach((d, i) => (d.style.background = SEATS[i % SEATS.length]));
  const count = div('create-count');
  const stepper = (sign: -1 | 1) => {
    const b = button('', () => {
      if (b.disabled) return;
      limit += sign;
      sync();
    }, 'create-step');
    b.innerHTML = icon(sign < 0 ? 'minus' : 'plus');
    return b;
  };
  const less = stepper(-1);
  const more = stepper(1);
  const stepBox = div('create-stepper');
  stepBox.append(less, count, more);
  const dotBox = div('create-dots');
  dotBox.append(...dots);
  const players = div('create-players');
  const playersText = div('create-note');
  playersText.append(el('b', '', 'Players'), el('span', '', msg('menu.createPlayers', { min, max })));
  const playersCtl = div('create-ctl');
  playersCtl.append(dotBox, stepBox);
  players.append(playersText, playersCtl);

  // Tools
  const toolsLabel = labelRow('Tools · click to turn off');
  const chips = new Map<Tool, HTMLElement>();
  const shelf = div('create-tools');
  for (const tool of TOOLS) {
    const chip = button('', () => {
      if (!off.delete(tool)) off.add(tool);
      sync();
    }, 'create-tool');
    chip.innerHTML = toolIcon(tool);
    chip.append(el('span', '', TOOL_NAMES[tool]));
    chips.set(tool, chip);
    shelf.append(chip);
  }
  const toolsBox = div('create-field');
  toolsBox.append(toolsLabel.row, shelf);

  // Start from
  const card = (title: string, pick: () => void) => {
    const c = div('create-card');
    const sub = div('create-sub');
    const text = div('create-card-text');
    text.append(el('b', '', title), sub);
    c.append(el('i', 'create-radio'), text);
    c.addEventListener('click', pick);
    return { el: c, sub, text };
  };
  const pickPaint = async () => {
    let picked: File;
    try {
      picked = await pickFile('.rhhpaint');
    } catch {
      return;
    }
    fileError = !picked.name.toLowerCase().endsWith('.rhhpaint');
    file = fileError ? null : picked;
    sync();
  };
  const empty = card('Empty roof', () => {
    fromFile = false;
    fileError = false;
    sync();
  });
  empty.sub.textContent = 'Everyone starts on clean walls';
  const paint = card('Paint file', () => {
    fromFile = true;
    if (!file) pickPaint();
    sync();
  });
  const change = button('Change', (e) => {
    e.stopPropagation();
    pickPaint();
  }, 'create-change');
  paint.el.append(change);
  const startBox = div('create-field');
  const cards = div('create-cards');
  cards.append(empty.el, paint.el);
  startBox.append(el('span', 'create-title', 'Start from'), cards);

  // Footer
  const summary = div('create-summary');
  const failure = div('para error');
  failure.hidden = true;
  const go = action('Create', async () => {
    if (!ready()) return;
    busy = true;
    failure.hidden = true;
    sync();
    try {
      await opts.create({ name: name.value.trim(), limit, tools: TOOLS.filter((t) => !off.has(t)), file: fromFile ? file : null });
    } catch (e) {
      failure.textContent = sentence((e as Error).message);
      failure.hidden = false;
    }
    busy = false;
    sync();
  }, { primary: true });
  const ready = () => !busy && name.value.trim() !== '' && (!fromFile || file !== null);

  ui.body.append(nameBox, players, toolsBox, startBox, failure);
  ui.buttons.append(summary, action('Cancel', opts.cancel, { key: 'ESC' }), go);
  name.addEventListener('input', sync);

  function sync() {
    nameLabel.state.textContent = `${name.value.length}/${SESSION_NAME_MAX}`;
    count.textContent = String(limit);
    dots.forEach((d, i) => d.classList.toggle('off', i >= limit));
    less.disabled = limit <= min;
    more.disabled = limit >= max;

    const names = TOOLS.filter((t) => off.has(t)).map((t) => TOOL_NAMES[t]);
    toolsLabel.state.textContent = names.length === 0 ? msg('menu.createToolsAll') : names.length === TOOLS.length ? msg('menu.createToolsNone') : msg('menu.createToolsOff', { tools: names.join(', ') });
    for (const [tool, chip] of chips) chip.classList.toggle('off', off.has(tool));

    empty.el.classList.toggle('on', !fromFile);
    paint.el.classList.toggle('on', fromFile);
    paint.el.classList.toggle('bad', fromFile && fileError);
    const sub = paint.sub;
    sub.innerHTML = file ? icon('file-check') : fileError ? '' : icon('file-upload');
    sub.append(file ? `${file.name} · ${aboutSize(file.size)}` : msg(fileError ? 'menu.createNotPaint' : 'menu.createFileHint'));
    change.hidden = !file;

    const start = !fromFile ? 'menu.createStartEmpty' : file ? 'menu.createStartFile' : 'menu.createStartNoFile';
    summary.textContent = msg('menu.createSummary', { players: limit, start: msg(start) });
    go.disabled = !ready();
    relabel(go, busy ? msg('menu.createBusy') : 'Create');
  }
  sync();
  return ui.root;
}
