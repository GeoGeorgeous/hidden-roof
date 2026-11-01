import { NET } from '../config';
import type { ServerLink } from './server-link';

// A link that has heard nothing from the server for NET.serverSilence is closed (multiplayer.ts reconnects when it
// reports closed). A browser can be slow to report it, so after NET.closeWait the game goes on without waiting.

export class Silence {
  /** The link this game closed for its silence: its close is a timeout. */
  private silenced: ServerLink | null = null;

  /** `lost(link)` is called when the browser has not reported a silenced link closed in time. */
  constructor(
    private log: (line: string) => void,
    private lost: (link: ServerLink) => void,
  ) {}

  /** Closes `link` if it has been silent for too long (`t`: now, s on its clock); whether it did. */
  check(link: ServerLink, t: number) {
    if (t - link.lastHeard <= NET.serverSilence) return false;
    this.log(`nothing from the server for ${NET.serverSilence} s: closing to reconnect`);
    this.silenced = link;
    link.close();
    setTimeout(() => this.lost(link), NET.closeWait * 1000);
    return true;
  }

  /** `link` was closed by `check`. */
  was(link: ServerLink) {
    return this.silenced === link;
  }
}
