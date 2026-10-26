import { NOTIFY } from './config.ts';
import type { DialogText } from './messages.ts';

// Every in-game message, as data: no DOM, the clock passed in (notify-view.ts
// draws it). Four kinds, each with a place of its own, so one doesn't hide another:
//   hint    keyed, set until cleared; one shows at a time, the highest
//           rank first, then the oldest; the others wait, still set
//   toast   a few seconds, newest last; a full stack drops the oldest; the same text again moves up and starts over
//   status  keyed, shown while set; the first NOTIFY.maxStatuses show; `succeed` turns it into
//           its result (a check and past tense) for NOTIFY.doneSeconds, then it goes
//   dialog  keyed, blocks play until answered (confirm); one shows, the rest wait
// The clock runs only while play is visible (update): a message that arrives or
// runs while a menu is open or the tab is hidden is seen in full after.
// Text marks bold parts with **double stars** (key names, item and player names).

type Kind = 'hint' | 'toast' | 'status' | 'dialog';

/** A message as shown: `lines` are already split (a hint has up to 3), `id` is new for each message. */
export interface Note {
  id: number;
  key: string;
  kind: Kind;
  /** A hint's lines, a toast's or status's text; none for a dialog. */
  lines: readonly string[];
  /** A hint's rank: higher shows first. */
  rank: number;
  /** A status's icon. */
  icon?: StatusIcon;
  /** A status that has succeeded: it shows its result for a moment. */
  done?: boolean;
  /** A dialog's card. */
  dialog?: Dialog;
}

/** What a status's icon is: bars with one lit (a weak link), a red ring (nothing heard), bars cycling (trying again), a check (done, only by `succeed`). */
export type StatusIcon = 'bars' | 'ring' | 'cycle' | 'check';

/** A dialog's card: its text (messages.ts), an error shown as a selectable callout, and the key of the status it grows out of, if that one shows. */
export interface Dialog extends DialogText {
  callout?: string;
  grow?: string;
}

/** Called when the player answers a dialog: accepted with its button (Enter), or not (Esc, which opens the menu). */
type Answer = (accepted: boolean) => void;

interface Held extends Note {
  /** The clock's time when a toast or a succeeded status goes. */
  until: number;
  answer?: Answer;
}

/**
 * What `set` takes: a keyed message of any kind but toast. All kinds share one key space: a key set under another
 * kind replaces that message (the reconnecting status becomes the lost session's dialog, which grows out of it).
 */
export type Keyed =
  | { key: string; kind: 'hint'; lines: string[]; rank?: number }
  | { key: string; kind: 'status'; text: string; icon?: StatusIcon }
  | { key: string; kind: 'dialog'; dialog: Dialog; answer?: Answer };

export class Notify {
  /** Changes whenever what shows could have changed. */
  version = 0;
  private notes: Held[] = [];
  private cache: readonly Note[] = [];
  private cacheVersion = -1;
  private clock = 0;
  private ids = 0;

  /** Sets a keyed message, or replaces the text of the one with this key (it keeps its age). */
  set(s: Keyed) {
    const lines = s.kind === 'hint' ? s.lines : s.kind === 'status' ? [s.text] : [];
    const next = { key: s.key, kind: s.kind, lines, rank: (s.kind === 'hint' && s.rank) || 0, icon: s.kind === 'status' ? s.icon : undefined, dialog: s.kind === 'dialog' ? s.dialog : undefined };
    const answer = s.kind === 'dialog' ? s.answer : undefined;
    const same = this.notes.find((n) => n.key === s.key);
    if (same && same.kind === s.kind) {
      same.answer = answer;
      // The same message again changes nothing; a status that had succeeded starts over.
      if (!same.done && same.rank === next.rank && same.icon === next.icon && same.lines.join('\n') === next.lines.join('\n') && JSON.stringify(same.dialog) === JSON.stringify(next.dialog)) return;
      Object.assign(same, next, { id: ++this.ids, done: false, until: 0 });
    } else {
      if (same) this.clear(s.key);
      this.notes.push({ ...next, answer, id: ++this.ids, until: 0 });
    }
    this.version++;
  }

  /** The status with this key has what it waited for: it switches to a check and `text` (past tense), and goes after NOTIFY.doneSeconds of play. */
  succeed(key: string, text: string) {
    const status = this.notes.find((n) => n.key === key && n.kind === 'status');
    if (!status) return;
    Object.assign(status, { lines: [text], icon: 'check', done: true, id: ++this.ids, until: this.clock + NOTIFY.doneSeconds });
    this.version++;
  }

  clear(key: string) {
    const i = this.notes.findIndex((n) => n.key === key);
    if (i < 0) return;
    this.notes.splice(i, 1);
    this.version++;
  }

  /** A dialog is up: play is blocked until it's confirmed. */
  get blocked() {
    for (const n of this.notes) if (n.kind === 'dialog') return true;
    return false;
  }

  /** The player answered the dialog on screen: it goes, its `answer` hears how, and the next dialog, if any, comes. */
  confirm(accepted = true) {
    const dialog = this.notes.find((n) => n.kind === 'dialog');
    if (!dialog) return;
    this.clear(dialog.key);
    dialog.answer?.(accepted);
  }

  /** A toast; one with the same text as one showing replaces it, newest and with its full time. */
  toast(text: string) {
    const same = this.notes.findIndex((n) => n.kind === 'toast' && n.lines[0] === text);
    if (same >= 0) this.notes.splice(same, 1);
    this.notes.push({ id: ++this.ids, key: '', kind: 'toast', lines: [text], rank: 0, until: this.clock + NOTIFY.toastSeconds });
    const toasts = this.notes.filter((n) => n.kind === 'toast');
    if (toasts.length > NOTIFY.maxToasts) this.notes.splice(this.notes.indexOf(toasts[0]), 1);
    this.version++;
  }

  /** One frame of play time; `visible`: pointer locked, no F3 panel, no build mode, the tab showing. */
  update(dt: number, visible: boolean) {
    if (!visible) return;
    this.clock += dt;
    let expired = false;
    for (const n of this.notes) if (n.until && n.until <= this.clock) expired = true;
    if (!expired) return;
    this.notes = this.notes.filter((n) => !n.until || n.until > this.clock);
    this.version++;
  }

  /** What to draw: the hint to show, the toasts oldest first, the statuses, the dialog. Same array until something changes. */
  shown(): readonly Note[] {
    if (this.cacheVersion === this.version) return this.cache;
    this.cacheVersion = this.version;
    const of = (kind: Kind) => this.notes.filter((n) => n.kind === kind);
    // The sort is stable: among equal ranks the one set first stays first.
    const hint = of('hint').sort((a, b) => b.rank - a.rank)[0];
    this.cache = [...(hint ? [hint] : []), ...of('toast'), ...of('status').slice(0, NOTIFY.maxStatuses), ...of('dialog').slice(0, 1)];
    return this.cache;
  }
}
