import { COLORS, SERVER } from '../config';
import type { Tool } from '../inventory/tool';
import { pickFile } from '../files';
import { msg } from '../messages';
import { aboutSize, action, button, div, el, notice, popup, relabel, sentence } from '../menu-ui';
import { tablerIcon } from '../ui-icons';
import { toolChip } from './lobby-view';
import { SESSION_NAME_MAX } from './protocol';
import { TOOLS, TOOL_NAMES } from './tool-icons';

// The "new session" dialog: the host's own name (`player`, the caller's field), the session's
// name, how many players, the tools it allows and what the roof starts from. The caller mounts the returned element like the
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

/** The dots' colors, one per seat. */
const SEATS = [COLORS.red, COLORS.cyan, COLORS.yellow, COLORS.green];

/** A label row: what it is on the left, its state on the right. */
function labelRow(label: string) {
  const row = div('field-label');
  const state = el('span');
  row.append(el('span', '', label), state);
  return { row, state };
}

export function createDialog(opts: { player: HTMLElement; create(s: NewSession): Promise<void>; cancel(): void }): HTMLElement {
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
    b.innerHTML = tablerIcon(sign < 0 ? 'minus' : 'plus');
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
    const chip = toolChip(tool, false);
    const toggle = button('', () => {
      if (!off.delete(tool)) off.add(tool);
      sync();
    });
    toggle.append(chip);
    chips.set(tool, chip);
    shelf.append(toggle);
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
  startBox.append(el('span', 'field-label', 'Start from'), cards);

  // Footer
  const summary = div('create-summary');
  /** The notice of a failed create, under the options. */
  let failure: HTMLElement | null = null;
  const go = action('Create', async () => {
    if (!ready()) return;
    busy = true;
    failure?.remove();
    sync();
    try {
      await opts.create({ name: name.value.trim(), limit, tools: TOOLS.filter((t) => !off.has(t)), file: fromFile ? file : null });
    } catch (e) {
      failure = notice(sentence((e as Error).message), { error: true });
      ui.body.append(failure);
    }
    busy = false;
    sync();
  }, { primary: true });
  const ready = () => !busy && name.value.trim() !== '' && (!fromFile || file !== null);

  ui.body.append(opts.player, nameBox, players, toolsBox, startBox);
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
    sub.innerHTML = file ? tablerIcon('file-check') : fileError ? '' : tablerIcon('file-upload');
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
