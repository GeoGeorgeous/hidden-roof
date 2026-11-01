import { NET } from '../config';
import type { ServerLink } from './server-link';

// A link that has heard nothing from the server for NET.serverSilence is closed (multiplayer.ts reconnects when it
// reports closed). A browser can be slow to report it, so after NET.closeWait the game lets go of the link and comes
// back as for any lost one, without waiting.

/** What it needs of the Multiplayer that holds it. */
interface Env {
  log(line: string): void;
  /** The link the game has now, if any. */
  link(): ServerLink | null;
  /** `link` closed (code 1006 when the game gave up on it). */
  closed(link: ServerLink, code: number, timedOut: boolean): void;
}

export class Silence {
  /** The link this game closed for its silence: its close is a timeout. */
  private silenced: ServerLink | null = null;

  constructor(private env: Env) {}

  /** Closes `link` if it has been silent for too long (`t`: now, s on its clock); whether it did. */
  check(link: ServerLink, t: number) {
    if (t - link.lastHeard <= NET.serverSilence) return false;
    this.env.log(`nothing from the server for ${NET.serverSilence} s: closing to reconnect`);
    this.silenced = link;
    link.close();
    setTimeout(() => this.lost(link), NET.closeWait * 1000);
    return true;
  }

  /** The browser has not reported a silenced link closed: let go of it. */
  private lost(link: ServerLink) {
    if (this.env.link() !== link) return;
    this.env.log(`the browser has not closed the silent link in ${NET.closeWait} s: reconnecting`);
    link.abandon();
    this.env.closed(link, 1006, false);
  }

  /** `link` was closed by `check`. */
  was(link: ServerLink) {
    return this.silenced === link;
  }
}
