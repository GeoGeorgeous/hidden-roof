import { NET } from '../config';
import type { Activity } from './protocol';

// What this player is doing, for the icon by their name in the others' games
// (nameplates.ts): away while the game is hidden (minimized, another tab), in
// the menu while paused, idle after NET.idleAfter s with nothing pressed, else
// here. Sent when it changes, while the link is live (multiplayer.ts); a
// hidden tab draws no frames, so hiding is sent at once.

export class OwnStatus {
  private sent: Activity = 'here';

  constructor(
    private game: { paused(): boolean; lastActive(): number },
    private send: (status: Activity) => void,
    live: () => boolean,
  ) {
    document.addEventListener('visibilitychange', () => live() && this.update(performance.now() / 1000));
  }

  /** In the session again (a welcome): the server takes the player as here. */
  restart(t: number) {
    this.sent = 'here';
    this.update(t);
  }

  update(t: number) {
    const now: Activity = document.hidden ? 'away' : this.game.paused() ? 'menu' : t - this.game.lastActive() > NET.idleAfter ? 'idle' : 'here';
    if (now === this.sent) return;
    this.sent = now;
    this.send(now);
  }
}
