import { COLORS, LOBBY } from '../config';
import type { Tool } from '../inventory/tool';
import { msg } from '../messages';
import { button, div, el, keyHint } from '../menu-ui';
import { lineIcon, tablerIcon } from '../ui-icons';
import type { LobbyEntry } from './protocol';
import { TOOL_NAMES, TOOLS, toolIcon } from './tool-icons';

// What the server list and the join dialogs draw of a session (style.css, .lobby): its line (name, who is in, how
// many, where), the tools it allows, and sentences with links in them.

/** Where the server is (a country code) and how long it takes to answer (ms). */
export interface Where {
  region: string;
  ping: number;
}

let countries: Intl.DisplayNames | null | undefined;
/** The country's name in English, or the code when the browser doesn't know it. */
function countryName(code: string) {
  countries ??= (() => {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      return null;
    }
  })();
  try {
    return countries?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The country code in a small box (its name on hover) and the ping beside it. */
export function whereTag({ region, ping }: Where) {
  const box = el('span', 'where');
  const tag = el('span', 'region', region);
  tag.title = countryName(region);
  box.append(tag, msg('lobby.ping', { ms: ping }));
  return box;
}

/** The players' initials as small rings, the first few of them, then how many more. */
function faces(players: string[]) {
  const box = el('span', 'faces');
  players.slice(0, LOBBY.facesShown).forEach((name, i) => {
    const face = el('span', '', [...name.trim()][0]?.toUpperCase() ?? '?');
    face.title = name;
    face.style.borderColor = COLORS[LOBBY.faceColors[i % LOBBY.faceColors.length]];
    box.append(face);
  });
  if (players.length > LOBBY.facesShown) box.append(el('span', 'more', `+${players.length - LOBBY.facesShown}`));
  return box;
}

/** A session's line: its name · who is in (their initials, unless `withFaces` is off) and how many of how many · where. */
export function sessionLine(entry: LobbyEntry, where: Where, withFaces = true) {
  const line = div('session-line');
  const players = el('span', 'players');
  if (withFaces) players.append(faces(entry.players));
  players.append(msg('lobby.players', { n: entry.players.length, limit: entry.limit }));
  line.append(el('b', '', entry.name), el('i', '', '·'), players, el('i', '', '·'), whereTag(where));
  return line;
}

/** The five tools in a row of small icons, the ones the session doesn't allow dimmed (the list's rows). */
export function toolIcons(tools: Tool[]) {
  const box = el('span', 'tool-icons');
  for (const tool of TOOLS) {
    const on = tools.includes(tool);
    const icon = el('span', on ? '' : 'off');
    icon.title = on ? TOOL_NAMES[tool] : msg('lobby.toolOff', { tool: TOOL_NAMES[tool] });
    icon.innerHTML = toolIcon(tool);
    box.append(icon);
  }
  return box;
}

/** "Tools in this session" over a segmented row of the tools by name: the allowed ones lit, the others struck through. */
export function toolsRow(tools: Tool[]) {
  const row = div('tools-row');
  const seg = div('seg');
  for (const tool of TOOLS) {
    const on = tools.includes(tool);
    const chip = el('span', on ? 'tool on' : 'tool off');
    chip.title = msg(on ? 'lobby.toolAllowed' : 'lobby.toolNotInSession');
    chip.innerHTML = toolIcon(tool);
    chip.append(el('span', '', TOOL_NAMES[tool]));
    seg.append(chip);
  }
  row.append(el('span', 'label', msg('lobby.toolsLabel')), seg);
  return row;
}

/** A tick or a cross and a line of the house rules. */
export function ruleItem(text: string, allowed: boolean) {
  const item = div(`rule ${allowed ? 'do' : 'dont'}`);
  const mark = el('span');
  mark.innerHTML = lineIcon(allowed ? 'check' : 'cross', 14, 1.6);
  item.append(mark, el('span', '', text));
  return item;
}

/** A sentence from a message with `{name}` in it, each name replaced by the element given for it. */
export function sentenceWith(template: string, parts: Record<string, Node>) {
  const line = el('span');
  template.split(/\{(\w+)\}/).forEach((piece, i) => line.append(i % 2 ? (parts[piece] ?? `{${piece}}`) : piece));
  return line;
}

/** A button of the shell control (the Back button's look): an icon, its text and its key. `act` null: not available, greyed out (`title` says why). */
export function shellButton(text: string, act: (() => void) | null, { icon, key, title }: { icon?: Parameters<typeof tablerIcon>[0]; key?: string; title?: string } = {}) {
  const box = div('seg shell');
  const b = button('', () => act?.());
  if (icon) b.innerHTML = tablerIcon(icon);
  b.append(text);
  if (key) b.append(keyHint(key));
  if (!act) b.setAttribute('aria-disabled', 'true');
  if (title) b.title = title;
  box.append(b);
  return box;
}
