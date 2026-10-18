import { button, div, el } from './menu-ui';

// The pause screen's status line in a live multiplayer session (pause-menu.ts):
// a live dot, your ping, the session's code with Copy, everyone's initials
// ringed in their paint colors, and how many are in. refresh() changes only
// what changed, so the menu around it isn't rebuilt.

/** What the line shows: the last round trip (s, null before the first), and everyone in the session, you first (colors as CSS, null: not known yet). */
export type SessionInfo = { ping: number | null; players: { name: string; color: string | null }[] };

/** "Copied" shows this long after Copy (ms). */
const COPIED_MS = 1500;

export class SessionLine {
  readonly el = div('live');
  private ping = el('span', 'ping');
  private code = el('b');
  private copy: HTMLButtonElement;
  private faces = div('faces');
  private count = el('span', '');
  /** What's shown, to change only what changed. */
  private shown = { ping: '', players: '' };
  private copied = 0;

  constructor() {
    this.ping.title = 'Your ping to the server';
    this.copy = button('Copy', () => this.copyCode(), 'copy');
    const code = el('span', 'code');
    code.append('Code ', this.code, this.copy);
    this.el.append(div('dot'), el('span', 'on-air', 'Live session'), this.ping, sep(), code, sep(), this.faces, this.count);
  }

  set session(code: string) {
    this.code.textContent = code;
  }

  refresh({ ping, players }: SessionInfo) {
    const ms = ping === null ? '' : `${Math.round(ping * 1000)} ms`;
    if (ms !== this.shown.ping) this.ping.textContent = this.shown.ping = ms;
    const key = players.map((p) => `${p.name}|${p.color}`).join('\n');
    if (key === this.shown.players) return;
    this.shown.players = key;
    this.faces.replaceChildren(
      ...players.map((p) => {
        const face = el('span', '', [...p.name.trim()][0]?.toUpperCase() ?? '?');
        face.title = p.name;
        if (p.color) face.style.borderColor = p.color;
        return face;
      }),
    );
    this.count.textContent = `${players.length} ${players.length === 1 ? 'player' : 'players'}`;
  }

  private copyCode() {
    navigator.clipboard?.writeText(this.code.textContent!).then(() => {
      this.copy.textContent = 'Copied';
      clearTimeout(this.copied);
      this.copied = window.setTimeout(() => (this.copy.textContent = 'Copy'), COPIED_MS);
    }, () => {});
  }
}

function sep() {
  return el('i', '', '·');
}
