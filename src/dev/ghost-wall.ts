import type { Level } from '../level/level';
import type { PropData } from '../level/level-data';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { loadPaint } from '../save/load-paint';
import { savePaint } from '../save/save-paint';
import { session } from '../session';

// The wall while the ghost (ghost.ts) has it. Playing puts on the paint its
// recording began with, so the player's own wall is put aside first, with its
// paint runs and stepladder, and comes back when the ghost stops. The clean
// wall puts the ghost's aside the same way, to go on from.

interface WallContext {
  level: Level;
  paint: PaintSystem;
  drips: PaintDrips;
}

/** A wall put aside. */
interface Kept {
  paint: Promise<Uint8Array>;
  runs: PaintDrips['runs'];
  ladder: PropData | null;
}

const NAME = { name: 'ghost' };

export class GhostWall {
  /** A paint is going on. */
  loading = false;
  /** Paints go on one at a time: a load can't stop halfway, and its faces would stay under the next one's. */
  private queue: Promise<unknown> = Promise.resolve();
  /** The last paint asked for: an older one gives up. */
  private newest = 0;
  /** The player's wall, while the ghost has it. */
  private mine: Kept | null = null;
  /** The ghost's wall, while the clean one is up. */
  private held: Kept | null = null;

  constructor(
    private g: WallContext,
    /** Who the ghost's stepladder belongs to. */
    private owner: string,
  ) {}

  get cleaned() {
    return !!this.held;
  }

  /** Done when the paint going on now is. */
  get settled() {
    return this.queue;
  }

  /** The player's wall and stepladder put aside, unless they are already. */
  take() {
    if (this.mine) return;
    this.mine = this.keep(session.player);
    if (this.mine.ladder) this.g.level.setRuntime(session.player, null);
  }

  /** The player's wall back, the stepladder where it stood unless they placed it again meanwhile. */
  giveBack() {
    const mine = this.mine;
    if (!mine) return;
    const { level, drips } = this.g;
    void this.swap(mine.paint, () => {
      drips.runs.push(...mine.runs);
      if (mine.ladder && level.runtimeOf(session.player) === undefined) level.setRuntime(session.player, mine.ladder);
      this.mine = null;
    });
  }

  /** The player's wall is not to come back: a session has the paint now. */
  forget() {
    this.mine = null;
  }

  /** The wall at `start`, what the ghost did held back. */
  clean(start: Promise<Uint8Array>) {
    this.take();
    this.held = this.keep(this.owner);
    this.g.level.setRuntime(this.owner, null);
    void this.swap(start);
  }

  /** The ghost's wall back, to go on from. */
  unclean() {
    const held = this.held!;
    const { level, drips } = this.g;
    void this.swap(held.paint, () => {
      drips.runs.push(...held.runs);
      if (held.ladder) level.setRuntime(this.owner, held.ladder);
      this.held = null;
    });
  }

  /** Whatever was asked for gives up, and the clean wall is over. */
  cancel() {
    this.newest++;
    this.loading = false;
    this.held = null;
  }

  /** Puts on a paint, then `after`, unless a newer one was asked for meanwhile or this one won't go on. */
  swap(bytes: Promise<Uint8Array>, after?: () => void) {
    const id = ++this.newest;
    this.loading = true;
    this.queue = this.queue.then(async () => {
      if (id !== this.newest) return;
      try {
        await loadPaint(this.g.paint, this.g.drips, await bytes, NAME);
        if (id !== this.newest) return;
        after?.();
      } catch (e) {
        console.warn('ghost: paint that would not go on', e);
      }
      if (id === this.newest) this.loading = false;
    });
  }

  private keep(owner: string): Kept {
    const { paint, drips, level } = this.g;
    const id = level.runtimeOf(owner);
    const p = id === undefined ? undefined : level.props.get(id);
    return { paint: savePaint(paint, NAME), runs: [...drips.runs], ladder: p ? { type: p.type, pos: [...p.pos], rot: p.rot } : null };
  }
}
