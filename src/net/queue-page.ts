import { msg } from '../messages';
import { div, notice } from '../menu-ui';
import { sessionLine, shellButton, type Where } from './lobby-view';
import type { NetStatus } from './status';
import type { LobbyEntry } from './protocol';

// The screen while the player waits in line for a full session (style.css, .loading-page: the loading screen's
// layout over the live view): the session's line, their place and how many are ahead. The server pushes the place
// when it changes, so nothing counts down while it's all well. A link lost meanwhile (the network retries it, with
// the place held for a while: net/multiplayer.ts) shows what is happening instead: the place held and for how long,
// the attempt and when the next one is. RECONNECT NOW tries at once, LEAVE QUEUE goes back to the list.

type Queued = Extract<NetStatus, { state: 'queued' }>;

const clock = () => performance.now() / 1000;
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class QueuePage {
  readonly root = div('page loading-page queue-page');
  private session = div('session-slot');
  private title = div('loading-title');
  private lead = div('loading-lead', msg('lobby.queueText'));
  private held = div('loading-lead');
  private lostBox = div('lost');
  private left = div('step');
  private right = div('share');
  private reconnect: HTMLElement;
  private lost: Queued['lost'];
  private position = 0;
  private timer = 0;

  constructor(leave: () => void, retryNow: () => void) {
    const text = div('loading-text');
    const line = div('step-line');
    line.append(this.left, this.right);
    const progress = div('progress');
    progress.append(line);
    this.lostBox.append(notice(msg('lobby.queueLost'), { error: true }), this.held);
    text.append(this.session, this.title, this.lead, this.lostBox, progress);
    // One group: RECONNECT NOW (only while the link is lost) and LEAVE QUEUE.
    const group = shellButton(msg('lobby.queueReconnect'), retryNow, { key: 'ENTER' });
    this.reconnect = group.firstElementChild as HTMLElement;
    group.append(shellButton(msg('lobby.queueLeave'), leave, { key: 'ESC' }).firstElementChild!);
    const exit = div('loading-exit');
    exit.append(group);
    this.root.append(text, exit);
    addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && !e.repeat && this.lost && this.root.checkVisibility()) retryNow();
    });
  }

  /** The session waited for. */
  show({ entry, where }: { entry: LobbyEntry; where: Where }) {
    this.session.replaceChildren(sessionLine(entry, where, false));
  }

  /** The place in line, and the link lost meanwhile or not. */
  update(s: Queued) {
    this.position = s.position || this.position;
    this.lost = s.lost;
    clearInterval(this.timer);
    if (s.lost) this.timer = window.setInterval(() => this.draw(), 500);
    this.draw();
  }

  private draw() {
    const lost = this.lost;
    this.reconnect.hidden = this.lostBox.hidden = !lost;
    this.lead.hidden = !!lost;
    if (!lost) {
      const ahead = this.position - 1;
      this.title.textContent = msg('lobby.queueTitle', { n: this.position });
      this.left.textContent = ahead > 0 ? msg('lobby.queueAhead', { n: ahead }) : msg('lobby.queueNext');
      this.right.textContent = '';
      return;
    }
    const t = clock();
    // The page isn't showing (the link ended the wait): nothing to count.
    if (!this.root.checkVisibility()) return clearInterval(this.timer);
    const retry = Math.ceil(lost.retryAt - t);
    this.title.textContent = msg('lobby.queueLostTitle');
    this.held.textContent = msg('lobby.queueHeld', { n: this.position, time: minutes(Math.max(0, lost.until - t)) });
    this.left.textContent = msg('lobby.queueAttempt', { n: lost.tries });
    this.right.textContent = retry > 0 ? msg('lobby.queueRetry', { s: retry }) : msg('lobby.queueRetrying');
  }
}
