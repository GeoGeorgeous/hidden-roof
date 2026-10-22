import { NOTIFY } from './config';

// Every in-game message, as data: no DOM, the clock passed in (notify-view.ts
// draws it). Four kinds, each with a place of its own, so one doesn't hide another:
//   advice  a hint: keyed, set until cleared; one shows at a time, the lowest
//           rank first, then the oldest; the others wait, still set
//   event   a toast: a few seconds, newest last; a full stack drops the oldest
//   status  a chip: keyed, shown while set; the first NOTIFY.maxChips show
//   error   keyed and typed only: no display yet
// The clock runs only while play is visible (update): a message that arrives or
// runs while a menu is open or the tab is hidden is seen in full after.
// Text marks bold parts with **double stars** (key names, item and player names).

type Kind = 'advice' | 'event' | 'status' | 'error';

/** A message as shown: `lines` are already split (a hint has up to 3), `id` is new for each message. */
export interface Note {
  id: number;
  key: string;
  kind: Kind;
  lines: readonly string[];
  /** Advice only: lower shows first. */
  rank: number;
}

interface Held extends Note {
  /** The clock's time when a toast goes. */
  until: number;
}

/** What `set` takes: a keyed message of any kind but event. */
export interface Setting {
  key: string;
  kind: Exclude<Kind, 'event'>;
  lines: string[];
  rank?: number;
}

export class Notify {
  /** Changes whenever what shows could have changed. */
  version = 0;
  private notes: Held[] = [];
  private cache: readonly Note[] = [];
  private cacheVersion = -1;
  private clock = 0;
  private ids = 0;

  /** Sets a keyed message, or replaces the text of the one with this key (it keeps its age). */
  set({ key, kind, lines, rank = 0 }: Setting) {
    const same = this.notes.find((n) => n.key === key);
    if (same && same.kind === kind) {
      if (same.rank === rank && same.lines.join('\n') === lines.join('\n')) return;
      same.rank = rank;
      same.lines = lines;
      same.id = ++this.ids;
    } else {
      if (same) this.clear(key);
      this.notes.push({ id: ++this.ids, key, kind, lines, rank, until: 0 });
    }
    this.version++;
  }

  clear(key: string) {
    const i = this.notes.findIndex((n) => n.key === key);
    if (i < 0) return;
    this.notes.splice(i, 1);
    this.version++;
  }

  /** A toast. */
  event(text: string) {
    this.notes.push({ id: ++this.ids, key: '', kind: 'event', lines: [text], rank: 0, until: this.clock + NOTIFY.toastSeconds });
    const toasts = this.notes.filter((n) => n.kind === 'event');
    if (toasts.length > NOTIFY.maxToasts) this.notes.splice(this.notes.indexOf(toasts[0]), 1);
    this.version++;
  }

  /** One frame of play time; `visible`: pointer locked, no F3 panel, no build mode, the tab showing. */
  update(dt: number, visible: boolean) {
    if (!visible) return;
    this.clock += dt;
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => n.kind !== 'event' || n.until > this.clock);
    if (this.notes.length !== before) this.version++;
  }

  /** What to draw: the hint to show, the toasts oldest first, the chips, the error. Same array until something changes. */
  shown(): readonly Note[] {
    if (this.cacheVersion === this.version) return this.cache;
    this.cacheVersion = this.version;
    const of = (kind: Kind) => this.notes.filter((n) => n.kind === kind);
    // The sort is stable: among equal ranks the one set first stays first.
    const hint = of('advice').sort((a, b) => a.rank - b.rank)[0];
    this.cache = [...(hint ? [hint] : []), ...of('event'), ...of('status').slice(0, NOTIFY.maxChips), ...of('error').slice(0, 1)];
    return this.cache;
  }
}
