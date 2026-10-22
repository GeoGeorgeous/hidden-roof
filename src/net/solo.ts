import { PAINT } from '../config';
import { download, stamp } from '../files';
import type { LevelData } from '../level/level-data';
import { hasPaint } from '../paint-surface';
import { loadPaint } from '../save/load-paint';
import { savePaint } from '../save/save-paint';
import { session } from '../session';
import { playLevel, type MultiplayerContext } from './game-context';

// The player's own game while a session has its level and paint: kept as a
// level and one paint file (nothing else, nothing on the GPU) when the welcome
// is about to replace them, and put back when the session ends.

export interface Solo {
  data: LevelData;
  name: string;
  /** Their paint as a paint file, null when there was none. */
  paint: Uint8Array | null;
}

/** The open level and its paint, kept. The paint is read at once: what lands after it isn't in the file. */
export async function keepSolo(g: MultiplayerContext): Promise<Solo> {
  const { data, name } = g.levelData();
  return { data, name, paint: [...g.paint.surfaces].some(hasPaint) ? await savePaint(g.paint, { name }) : null };
}

/** The kept level from its spawn at the player's own PAINT DETAIL, with the paint it had; the session's is gone, free again. */
export async function restoreSolo(g: MultiplayerContext, solo: Solo) {
  const built = g.paint.texelsPerMeter;
  g.ownDetail();
  playLevel(g, solo.data, solo.name, built, PAINT.texelsPerMeter);
  if (solo.paint) await loadPaint(g.paint, g.drips, solo.paint, { name: solo.name });
}

/** What the tail of a session needs from the Multiplayer that holds it. */
interface Env {
  /** Runs the job in the message queue (after the message being handled and the ones waiting, before any that comes later). */
  enqueue(job: () => Promise<void>): Promise<void>;
  log(line: string): void;
  /** Counts the sessions ended. */
  attempt(): number;
  /** A HOST or JOIN is under way. */
  connecting(): boolean;
  /** The player's own game is back and the menu goes to its title view. */
  onEnd(): void;
}

/**
 * Getting the player's own level and paint back when a session ends. A planned end (LEAVE, a failed JOIN) brings them back at
 * once. A session lost for good while playing (a failure after the welcome) doesn't: the player stays in the game with the
 * session's paint, which the dialogue offers to save, and the answer to it (`answer`) brings the rest back.
 */
export class SoloReturn {
  /** Resolves once the player's own game is back: HOST and JOIN wait for it. */
  restoring: Promise<void> = Promise.resolve();
  private lost: { solo: Solo; name: string } | null = null;
  private g: MultiplayerContext;
  private env: Env;

  constructor(g: MultiplayerContext, env: Env) {
    this.g = g;
    this.env = env;
  }

  /** The session is over: back at once, or (`lostName`: the level it was on) waiting for the answer to the dialogue. */
  end(solo: Solo, lostName?: string) {
    if (lostName === undefined) this.back(solo, true);
    else this.lost = { solo, name: lostName };
  }

  /**
   * The answer to the lost session's dialogue: `save` first writes the session's paint as a file (the link is down, so not SAVE),
   * then the player's own level and paint come back. The player stays in play; the menu is not sent to its title.
   */
  async answer(save: boolean) {
    const lost = this.lost;
    if (!lost) return;
    this.lost = null;
    if (save) {
      try {
        const bytes = await savePaint(this.g.paint, { name: lost.name });
        download(new Blob([bytes as BlobPart]), `${lost.name}-${stamp(new Date())}.rhhpaint`);
      } catch (err) {
        console.error(err);
        this.env.log(`couldn't save the paint of the lost session: ${err}`);
      }
    }
    this.back(lost.solo, false);
  }

  /** `title`: the menu goes to its title view after, unless a HOST or JOIN began meanwhile. */
  private back(solo: Solo, title: boolean) {
    const attempt = this.env.attempt();
    this.restoring = this.env.enqueue(async () => {
      session.joining = true;
      try {
        await restoreSolo(this.g, solo);
      } catch (err) {
        console.error(err);
        this.env.log(`couldn't bring back the paint from before the session: ${err}`);
      }
      session.joining = this.env.connecting();
      if (title && attempt === this.env.attempt() && !this.env.connecting()) this.env.onEnd();
    });
  }
}
