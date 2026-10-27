import { msg } from '../messages';
import { action, div } from '../menu-ui';
import { sessionLine, shellButton, type Where } from './lobby-view';
import type { LobbyEntry } from './protocol';

// The screen while a session loads (style.css, .loading-page), from JOIN until the player is in: the session's line,
// what is happening and how far along the paint's download is, and CANCEL. It follows the network's progress lines
// (net/multiplayer.ts, onProgress): connecting and joining, the paint coming down with its percent, the paint going
// onto the walls, and the moment before the game takes over. Once the player is in, the same screen stays without its
// progress, over the city view, and asks for a click (CLICK TO PLAY beside CANCEL, or anywhere): that click takes the pointer lock (net/net-menu.ts).

const STEP = { joining: 'lobby.stepJoining', downloading: 'lobby.stepDownloading', putting: 'lobby.stepPutting', dropping: 'lobby.stepDropping' } as const;

export class LoadingPage {
  readonly root = div('page loading-page');
  private session = div('session-slot');
  private step = div('step');
  private share = div('share');
  private fill = div('fill');
  private name = '';

  constructor(cancel: () => void, play: () => void) {
    const text = div('loading-text');
    const bar = div('bar');
    bar.append(this.fill);
    const line = div('step-line');
    line.append(this.step, this.share);
    const progress = div('progress');
    progress.append(line, bar);
    text.append(this.session, div('loading-title', msg('lobby.loadingTitle')), div('loading-lead', msg('lobby.loadingText')), progress);
    const exit = div('loading-exit');
    // Beside CANCEL once the player is in (`ready`): Enter runs it (menu-ui.ts), a click anywhere else on the screen too.
    const click = action(msg('lobby.clickToPlay'), play, { primary: true, key: '' });
    click.classList.add('loading-click');
    exit.append(shellButton(msg('lobby.cancel'), cancel, { key: 'ESC' }), click);
    this.root.append(text, exit);
    this.root.addEventListener('click', (e) => !(e.target as Element).closest('button') && this.root.classList.contains('ready') && play());
  }

  /** Starts over for this session. */
  show(entry: LobbyEntry, where: Where) {
    this.root.classList.remove('ready');
    this.name = entry.name;
    this.session.replaceChildren(sessionLine(entry, where, false));
    this.go('joining');
  }

  /** The network's progress line (null: none, the game is about to take over once the paint is on). */
  update(text: string | null) {
    const share = text && /(\d+)%$/.exec(text);
    if (text === null) this.go('dropping', 100);
    else if (share) this.go('downloading', Number(share[1]));
    else if (text === msg('menu.progressLoading')) this.go('putting', 100);
    else this.go('joining');
  }

  /** The player is in: the progress goes, CLICK TO PLAY shows. */
  ready() {
    this.root.classList.add('ready');
  }

  private go(step: keyof typeof STEP, percent = 0) {
    this.step.textContent = msg(STEP[step], { session: this.name });
    this.share.textContent = `${percent}%`;
    this.fill.style.width = `${percent}%`;
  }
}
