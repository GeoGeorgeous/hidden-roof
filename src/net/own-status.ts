import { NET } from '../config.ts';
import type { Activity } from './protocol';

// What this player is doing, for the icon by their name in the others' games
// (nameplates.ts): away while the game is hidden (minimized, another tab), in
// the menu while paused, idle after NET.idleAfter s with nothing pressed, lagging
// while the player's own link is in trouble (bad connection or no signal, the
// flags of their own status chip: link-health.ts), else here. Sent when it
// changes, while the link is live (multiplayer.ts); a hidden tab draws no
// frames, so hiding is sent at once. The first that applies wins, in that order.

export interface Doing {
  hidden: boolean;
  paused: boolean;
  /** Since anything was pressed (s). */
  idleFor: number;
  /** The player's own link is in trouble. */
  trouble: boolean;
}

export function activity(d: Doing): Activity {
  return d.hidden ? 'away' : d.paused ? 'menu' : d.idleFor > NET.idleAfter ? 'idle' : d.trouble ? 'lagging' : 'here';
}

export class OwnStatus {
  private sent: Activity = 'here';

  constructor(
    private game: { paused(): boolean; lastActive(): number },
    private send: (status: Activity) => void,
    live: () => boolean,
    private trouble: () => boolean,
  ) {
    document.addEventListener('visibilitychange', () => live() && this.update(performance.now() / 1000));
  }

  /** In the session again (a welcome): the server takes the player as here. */
  restart(t: number) {
    this.sent = 'here';
    this.update(t);
  }

  update(t: number) {
    const now = activity({ hidden: document.hidden, paused: this.game.paused(), idleFor: t - this.game.lastActive(), trouble: this.trouble() });
    if (now === this.sent) return;
    this.sent = now;
    this.send(now);
  }
}
