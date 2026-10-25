import { msg } from '../messages';
import { div } from '../menu-ui';
import { sessionLine, shellButton, type Where } from './lobby-view';
import type { LobbyEntry } from './protocol';

// The screen while a session loads (style.css, .loading-page), from JOIN until the player is in: the session's line,
// what is happening and how far along the paint's download is, and CANCEL. It follows the network's progress lines
// (net/multiplayer.ts, onProgress): connecting and joining, the paint coming down with its percent, the paint going
// onto the walls, and the moment before the game takes over.

const STEP = { joining: 'lobby.stepJoining', downloading: 'lobby.stepDownloading', putting: 'lobby.stepPutting', dropping: 'lobby.stepDropping' } as const;

export class LoadingPage {
  readonly root = div('page loading-page');
  private session = div('session-slot');
  private step = div('step');
  private share = div('share');
  private fill = div('fill');
  private name = '';

  constructor(cancel: () => void) {
    const text = div('loading-text');
    const bar = div('bar');
    bar.append(this.fill);
    const line = div('step-line');
    line.append(this.step, this.share);
    const progress = div('progress');
    progress.append(line, bar);
    text.append(this.session, div('loading-title', msg('lobby.loadingTitle')), div('loading-lead', msg('lobby.loadingText')), progress);
    const exit = div('loading-exit');
    exit.append(shellButton(msg('lobby.cancel'), cancel, { key: 'ESC' }));
    this.root.append(text, exit);
  }

  /** Starts over for this session. */
  show(entry: LobbyEntry, where: Where) {
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

  private go(step: keyof typeof STEP, percent = 0) {
    this.step.textContent = msg(STEP[step], { session: this.name });
    this.share.textContent = `${percent}%`;
    this.fill.style.width = `${percent}%`;
  }
}
