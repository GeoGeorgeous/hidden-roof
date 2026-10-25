import { LOBBY } from '../config';
import { msg, type MessageId } from '../messages';
import { button, div, el, notice } from '../menu-ui';
import { lineIcon } from '../ui-icons';
import { fetchLobby } from './lobby-list';
import { shellButton, toolIcons, whereTag, type Where } from './lobby-view';
import type { LobbyEntry } from './protocol';

// The server list of the Multiplayer page (style.css, .lobby): a row for each session, public and private, or
// bars in their place while the server is asked (only when it is slow), a note when there is none, or a notice when
// the server can't be reached.
// A row picks its session (net-menu.ts opens the dialog for joining it).

export class LobbyPage {
  readonly el = div('lobby-list');
  /** Each refresh is a run; the answer of one that isn't the last is dropped. */
  private run = 0;
  /** Where the server is and its ping, as the last answer said (null before one). */
  where: Where | null = null;

  /** `failed`: the server can't be reached, for the reason given; it answers with the buttons to add to the notice (the page shows one failure, not two). */
  constructor(
    private pick: (entry: LobbyEntry, where: Where) => void,
    private failed: (why: MessageId) => HTMLElement[],
  ) {}

  /** Asks the server again. The old content stays while it answers; the bars come only when it is slow. */
  async refresh() {
    const run = ++this.run;
    let barsAt = 0;
    const timer = setTimeout(() => {
      barsAt = performance.now();
      this.el.replaceChildren(skeleton());
    }, LOBBY.skeletonDelay * 1000);
    const answer = await fetchLobby();
    clearTimeout(timer);
    // Bars on screen stay a while, so they never flicker.
    if (barsAt) await new Promise((done) => setTimeout(done, LOBBY.skeletonMin * 1000 - (performance.now() - barsAt)));
    if (run !== this.run) return;
    if ('why' in answer) {
      const actions = [shellButton(msg('lobby.refresh'), () => void this.refresh(), { icon: 'refresh', key: 'R' }), ...this.failed(answer.why)];
      return this.el.replaceChildren(notice(msg('lobby.listFailedHint'), { error: true, title: msg(answer.why), actions }));
    }
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

  /** Nothing to pick from: a line, what to do about it, and REFRESH. */
  private note(title: string, text: string) {
    const box = div('lobby-note');
    box.append(div('note-title', title), div('text', text));
    box.append(shellButton(msg('lobby.refresh'), () => void this.refresh(), { icon: 'refresh', key: 'R' }));
    return box;
  }
}

/** The bars the list shows while it is asked for: rows of the same columns, no spinner. */
function skeleton() {
  const box = div('lobby-skeleton');
  box.setAttribute('aria-busy', 'true');
  box.setAttribute('aria-label', msg('lobby.loadingList'));
  for (const width of LOBBY.skeletonNames) {
    const row = div('big-row session skeleton-row');
    const text = div('text');
    const name = div('bar name');
    name.style.width = `${width}px`;
    text.append(name, div('bar sub'));
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
