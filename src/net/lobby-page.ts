import { LOBBY } from '../config';
import { msg } from '../messages';
import { button, div, el } from '../menu-ui';
import { lineIcon } from '../ui-icons';
import { fetchLobby } from './lobby-list';
import { shellButton, toolIcons, whereTag, type Where } from './lobby-view';
import type { LobbyEntry } from './protocol';

// The server list of the Multiplayer page (style.css, .lobby): a row for each session, public and private, or
// bars in their place while the server is asked, or a note when there is none or the server can't be reached.
// A row picks its session (net-menu.ts opens the dialog for joining it).

export class LobbyPage {
  readonly el = div('lobby-list');
  /** Each refresh is a run; the answer of one that isn't the last is dropped. */
  private run = 0;
  /** Where the server is and its ping, as the last answer said (null before one). */
  where: Where | null = null;

  constructor(private pick: (entry: LobbyEntry, where: Where) => void) {}

  /** Asks the server again, bars meanwhile. */
  async refresh() {
    const run = ++this.run;
    this.el.replaceChildren(skeleton());
    const answer = await fetchLobby();
    if (run !== this.run) return;
    if ('why' in answer) return this.el.replaceChildren(this.note(msg(answer.why), '', true));
    const where = (this.where = { region: answer.value.region, ping: answer.ping });
    const { sessions } = answer.value;
    this.el.replaceChildren(...(sessions.length ? sessions.map((s) => this.row(s, where)) : [this.note(msg('lobby.emptyTitle'), msg('lobby.emptyText'))]));
  }

  /** The session, with where the server is and its ping. */
  private row(entry: LobbyEntry, where: Where) {
    const row = button('', () => this.pick(entry, where), 'big-row session');
    const kind = el('span', 'kind');
    kind.innerHTML = lineIcon(entry.kind === 'private' ? 'lock' : 'globe');
    kind.append(msg(entry.kind === 'private' ? 'lobby.private' : 'lobby.public'));
    const text = div('text');
    text.append(el('b', '', entry.name), kind);
    const count = el('div', 'count', String(entry.players.length));
    count.append(el('small', '', `/${entry.limit}`));
    const there = div('where-col');
    there.append(whereTag(where));
    row.append(text, count, there, toolIcons(entry.tools), el('i', '', '›'));
    return row;
  }

  /** Nothing to pick from: a line (red when it is trouble), what to do about it, and REFRESH. */
  private note(title: string, text: string, error = false) {
    const box = div('lobby-note');
    box.append(div(error ? 'note-title error' : 'note-title', title));
    if (text) box.append(div('text', text));
    box.append(shellButton(msg('lobby.refresh'), () => void this.refresh(), { icon: 'refresh', key: 'R' }));
    return box;
  }
}

/** The bars the list shows while it is asked for: rows of the same columns, no spinner. */
function skeleton() {
  const box = div('lobby-skeleton');
  box.setAttribute('aria-busy', 'true');
  box.setAttribute('aria-label', msg('lobby.loadingList'));
  for (let i = 0; i < LOBBY.skeletonRows; i++) {
    const row = div('big-row session skeleton-row');
    const text = div('text');
    text.append(div('bar name'), div('bar sub'));
    const bar = (name: string) => {
      const col = div(name);
      col.append(div('bar'));
      return col;
    };
    row.append(text, bar('count'), bar('where-col'), bar('tool-icons'), el('i'));
    box.append(row);
  }
  return box;
}
