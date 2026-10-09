// The paint files of welcomes and SAVE (session.ts): a session's paint at one
// moment, as 'part' frames (protocol.ts partFrames) made once for every player
// who gets them. Made one at a time in the whole process, since reading the
// paint of a session at ULTRA is hundreds of MB; a session asking while one of
// its own is waiting to be made shares that one.

export class Snapshot {
  /** The ops frames relayed since its paint was read, and who sent them: a joiner gets them after the file. */
  readonly log: Uint8Array[] = [];
  readonly senders = new Set<number>();
  /** Players who got it, joins and SAVEs. */
  served = 0;
  /** Its frames; null when no one still wanted it once its turn came (it wasn't made). */
  readonly frames: Promise<Uint8Array[] | null>;
  private done!: (frames: Uint8Array[] | null) => void;
  private failed!: (e: unknown) => void;
  private wants: (() => boolean)[] = [];

  constructor(frames?: Uint8Array[]) {
    this.frames = frames ? Promise.resolve(frames) : new Promise((done, failed) => ((this.done = done), (this.failed = failed)));
  }

  /** Someone waits for it while `still()` (their link is the same and open). */
  want(still: () => boolean) {
    this.wants.push(still);
    return this;
  }

  /** An ops frame relayed after its paint was read. */
  relayed(frame: Uint8Array, sender: number) {
    this.log.push(frame);
    this.senders.add(sender);
  }

  /** Made by `make` when its turn comes, if anyone still wants it then. */
  queue(make: () => Promise<Uint8Array[]>) {
    queued++;
    turn = turn.then(async () => {
      queued--;
      if (!this.wants.some((w) => w())) return this.done(null);
      await make().then(this.done, this.failed);
    });
  }
}

let turn = Promise.resolve();
let queued = 0;

/** Paint files waiting for their turn. */
export const waiting = () => queued;
