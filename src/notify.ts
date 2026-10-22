import { NOTIFY } from './config.ts';
import type { Action } from './input.ts';
import type { DialogueText } from './messages.ts';

// Every in-game message, as data: no DOM, the clock passed in (notify-view.ts
// draws it). Four kinds, each with a place of its own, so one doesn't hide another:
//   advice  a hint: keyed, set until cleared; one shows at a time, the highest
//           rank first, then the oldest; the others wait, still set
//   event   a toast: a few seconds, newest last; a full stack drops the oldest
//   status  a chip: keyed, shown while set; the first NOTIFY.maxChips show; `succeed` turns it into
//           its result (a check and past tense) for NOTIFY.doneSeconds, then it goes
//   error   a dialogue: keyed, blocks play until answered (confirm); one shows, the rest wait
// The clock runs only while play is visible (update): a message that arrives or
// runs while a menu is open or the tab is hidden is seen in full after.
// Text marks bold parts with **double stars** (key names, item and player names).

type Kind = 'advice' | 'event' | 'status' | 'error';

/** A message as shown: `lines` are already split (a hint has up to 3), `id` is new for each message. */
export interface Note {
  id: number;
  key: string;
  kind: Kind;
  /** A hint's lines, a toast's or chip's text; none for a dialogue. */
  lines: readonly string[];
  /** Advice only: higher shows first. */
  rank: number;
  /** A chip's icon. */
  icon?: ChipIcon;
  /** A chip that has succeeded: it shows its result for a moment. */
  done?: boolean;
  /** An error's card. */
  dialogue?: Dialogue;
}

/** What a chip's icon is: bars with one lit (a weak link), a red ring (nothing heard), bars cycling (trying again), a check (done, only by `succeed`). */
export type ChipIcon = 'bars' | 'ring' | 'cycle' | 'check';

/** A dialogue's card: its text (messages.ts), an error shown as a selectable callout, and whether it grows out of the chip with the same key. */
export interface Dialogue extends DialogueText {
  callout?: string;
  grow?: boolean;
}

interface Held extends Note {
  /** The clock's time when a toast goes. */
  until: number;
}

/** What `set` takes: a keyed message of any kind but event. */
export type Setting =
  | { key: string; kind: 'advice'; lines: string[]; rank?: number }
  | { key: string; kind: 'status'; lines: string[]; icon?: ChipIcon }
  | { key: string; kind: 'error'; dialogue: Dialogue };

/**
 * A hint's line as the player reads it: `Press {use} to draw` as `Press **LMB** to draw`. Each `{action}` becomes
 * its key name in bold, at display time, so rebinding or the keyboard layout arriving changes it. An unbound key
 * (`—`) isn't bold.
 */
export function resolveLine(line: string, label: (action: Action) => string) {
  return line.replace(/\{(\w+)\}/g, (_, action: string) => {
    const key = label(action as Action).replaceAll('*', '×');
    return key === '—' ? key : `**${key}**`;
  });
}

export class Notify {
  /** Changes whenever what shows could have changed. */
  version = 0;
  /** Called with the key of an error the player answered: accepted with its button (Enter), or not (Esc, which opens the menu). */
  onConfirm: (key: string, accepted: boolean) => void = () => {};
  private notes: Held[] = [];
  private cache: readonly Note[] = [];
  private cacheVersion = -1;
  private clock = 0;
  private ids = 0;

  /** Sets a keyed message, or replaces the text of the one with this key (it keeps its age). */
  set(s: Setting) {
    const next = { key: s.key, kind: s.kind, lines: 'lines' in s ? s.lines : [], rank: ('rank' in s && s.rank) || 0, icon: 'icon' in s ? s.icon : undefined, dialogue: 'dialogue' in s ? s.dialogue : undefined };
    const same = this.notes.find((n) => n.key === s.key);
    if (same && same.kind === s.kind) {
      // The same message again changes nothing; a chip that had succeeded starts over.
      if (!same.done && same.rank === next.rank && same.icon === next.icon && same.lines.join('\n') === next.lines.join('\n') && JSON.stringify(same.dialogue) === JSON.stringify(next.dialogue)) return;
      Object.assign(same, next, { id: ++this.ids, done: false, until: 0 });
    } else {
      if (same) this.clear(s.key);
      this.notes.push({ ...next, id: ++this.ids, until: 0 });
    }
    this.version++;
  }

  /** The chip with this key has what it waited for: it switches to a check and `text` (past tense), and goes after NOTIFY.doneSeconds of play. */
  succeed(key: string, text: string) {
    const chip = this.notes.find((n) => n.key === key && n.kind === 'status');
    if (!chip) return;
    Object.assign(chip, { lines: [text], icon: 'check', done: true, id: ++this.ids, until: this.clock + NOTIFY.doneSeconds });
    this.version++;
  }

  clear(key: string) {
    const i = this.notes.findIndex((n) => n.key === key);
    if (i < 0) return;
    this.notes.splice(i, 1);
    this.version++;
  }

  /** An error is up: play is blocked until it's confirmed. */
  get blocked() {
    return this.notes.some((n) => n.kind === 'error');
  }

  /** The player answered the dialogue on screen: it goes, and the next error, if any, comes. */
  confirm(accepted = true) {
    const error = this.notes.find((n) => n.kind === 'error');
    if (!error) return;
    this.clear(error.key);
    this.onConfirm(error.key, accepted);
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
    this.notes = this.notes.filter((n) => !n.until || n.until > this.clock);
    if (this.notes.length !== before) this.version++;
  }

  /** What to draw: the hint to show, the toasts oldest first, the chips, the error. Same array until something changes. */
  shown(): readonly Note[] {
    if (this.cacheVersion === this.version) return this.cache;
    this.cacheVersion = this.version;
    const of = (kind: Kind) => this.notes.filter((n) => n.kind === kind);
    // The sort is stable: among equal ranks the one set first stays first.
    const hint = of('advice').sort((a, b) => b.rank - a.rank)[0];
    this.cache = [...(hint ? [hint] : []), ...of('event'), ...of('status').slice(0, NOTIFY.maxChips), ...of('error').slice(0, 1)];
    return this.cache;
  }
}
