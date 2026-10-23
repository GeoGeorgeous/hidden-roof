// The tutorial: which hints are wanted now, which are learnt, what is stored. The game tells it facts and
// a snapshot per frame; it hands the one hint to show to the message layer. No DOM: tested in Node
// (scripts/tutorial.test.mjs). Time advances only by the visible play time the caller passes.

import { TUTORIAL } from '../config.ts';
import { stored, store } from '../stored.ts';
import { amount, holds, newSeen, see } from './conditions.ts';
import type { Ctx, Seen } from './conditions.ts';
import { HINTS } from './hints.ts';
import type { Fact, HintDef, Notes, Rank, Snapshot } from './types.ts';

const TUTORIAL_KEY = 'roofhiddenhaus.tutorial';

/** What the message layer ranks by: higher wins. */
const RANK: Record<Rank, number> = { tool: 3, context: 2, basic: 1 };

/** Where progress lives: the browser's storage (stored.ts), or a test's. */
export interface Storage {
  read(): string | null;
  write(text: string): void;
}

const browserStorage: Storage = { read: () => stored(TUTORIAL_KEY), write: (text) => store(TUTORIAL_KEY, text) };

interface State {
  def: HintDef;
  seen: Seen;
  wanted: boolean;
  /** When it became wanted: older shows first within a rank. */
  seq: number;
  /** Visible seconds on screen. */
  shownFor: number;
}

export class Tutorial {
  private notes: Notes;
  private storage: Storage;
  private states: State[];
  private done = new Set<string>();
  private played = 0;
  private seq = 0;
  private on = true;
  /** How many hints are not learnt yet. */
  private left = 0;
  private snap: Snapshot = { tool: null, tools: [], lowPressure: false, colors: 1, caps: 1, nearLadder: false, onLadder: false };
  /** What the message layer has: the hint's id and which of its texts. */
  private shown: { id: string; text: number } | null = null;

  constructor(notes: Notes, storage: Storage = browserStorage, hints: HintDef[] = HINTS) {
    this.notes = notes;
    this.storage = storage;
    this.states = hints.map((def) => ({ def, seen: newSeen(), wanted: false, seq: 0, shownFor: 0 }));
    this.load();
    this.recount();
  }

  /** Hints on or off (a setting). Off: nothing shown, nothing recorded; the progress stays. */
  setEnabled(on: boolean) {
    this.on = on;
    if (!on) this.show(null);
  }

  /** Hints are on and something is left to learn: only then do facts and the snapshot count. */
  get teaching() {
    return this.on && this.left > 0;
  }

  /** Show hints again: forgets what was learnt. */
  reset() {
    this.done.clear();
    this.recount();
    this.save();
    for (const s of this.states) this.forget(s);
    this.show(null);
  }

  /** Something was learnt: Show hints again has something to forget. */
  anyLearnt() {
    return this.done.size > 0;
  }

  isLearnt(id: string) {
    return this.done.has(id);
  }

  /** Something happened. */
  fact(f: Fact) {
    if (!this.on) return;
    for (const s of this.states) if (s.wanted) see(s.seen, f);
  }

  /** Once a frame. `visible`: the player is looking at play (locked, no panel, not building, tab visible). `snap`: not needed while nothing is `teaching`; only the clock runs then. */
  update(dt: number, visible: boolean, snap?: Snapshot) {
    if (!this.on || !visible) return;
    this.played += dt;
    if (!snap || this.left === 0) return;
    this.snap = snap;
    const wanted = this.refresh();
    const pick = this.pick(wanted);
    // Time on screen counts while the hint itself shows, not its "take it" step.
    if (pick && this.text(pick) === (pick.def.steps?.length ?? 0)) pick.shownFor += dt;
    let learnt = false;
    for (const s of wanted) {
      if (this.finished(s, s === pick)) {
        this.done.add(s.def.id);
        learnt = true;
      }
    }
    if (learnt) {
      this.recount();
      this.save();
      this.show(this.pick(this.refresh()));
    } else this.show(pick);
  }

  private ctx(s: State): Ctx {
    return { snap: this.snap, played: this.played, seen: s.seen };
  }

  /** Marks which unlearnt hints are wanted; a context hint that stops being wanted starts over. */
  private refresh() {
    const wanted: State[] = [];
    for (const s of this.states) {
      const { def } = s;
      const want = !this.done.has(def.id) && (def.after ?? []).every((id) => this.done.has(id)) && holds(def.show, this.ctx(s));
      if (want && !s.wanted) s.seq = ++this.seq;
      if (!want && def.rank === 'context') this.forget(s);
      s.wanted = want;
      if (want) wanted.push(s);
    }
    return wanted;
  }

  private forget(s: State) {
    s.seen = newSeen();
    s.shownFor = 0;
    s.wanted = false;
  }

  /** The one to show: the highest rank, the oldest within it. */
  private pick(wanted: State[]) {
    let best: State | null = null;
    for (const s of wanted) {
      if (!best || RANK[s.def.rank] > RANK[best.def.rank] || (RANK[s.def.rank] === RANK[best.def.rank] && s.seq < best.seq)) best = s;
    }
    return best;
  }

  /**
   * Learnt: by time, once it has been on screen long enough; by action, once the player did it, but not before
   * minShown on screen, so it doesn't flash. One the player did before ever seeing it is learnt silently.
   */
  private finished(s: State, showing: boolean) {
    const { done } = s.def;
    const x = this.ctx(s);
    const acted = done.action !== undefined && holds(done.action, x);
    if (acted && s.shownFor === 0) return true;
    if (!showing || s.shownFor < TUTORIAL.minShown) return false;
    return acted || (done.shown !== undefined && s.shownFor >= amount(done.shown));
  }

  /** Which text a hint shows now: the first step not yet done, or (the number of steps) the hint itself. */
  private text(s: State) {
    const steps = s.def.steps ?? [];
    const ctx = this.ctx(s);
    const step = steps.findIndex((st) => !holds(st.until, ctx));
    return step < 0 ? steps.length : step;
  }

  /** The note for the message layer: only the one hint, and only when it or its step changed. */
  private show(s: State | null) {
    if (!s) {
      if (this.shown) this.notes.clear(`hint:${this.shown.id}`);
      this.shown = null;
      return;
    }
    const steps = s.def.steps ?? [];
    const text = this.text(s);
    if (this.shown?.id === s.def.id && this.shown.text === text) return;
    if (this.shown && this.shown.id !== s.def.id) this.notes.clear(`hint:${this.shown.id}`);
    this.shown = { id: s.def.id, text };
    this.notes.set({ key: `hint:${s.def.id}`, kind: 'hint', rank: RANK[s.def.rank], lines: text < steps.length ? steps[text].lines : s.def.lines });
  }

  private recount() {
    this.left = this.states.filter((s) => !this.done.has(s.def.id)).length;
  }

  private load() {
    try {
      const data = JSON.parse(this.storage.read() ?? '');
      if (data?.v === 1 && Array.isArray(data.done)) for (const id of data.done) if (typeof id === 'string') this.done.add(id);
    } catch {
      // Nothing stored, or not ours: nothing learnt.
    }
  }

  private save() {
    this.storage.write(JSON.stringify({ v: 1, done: [...this.done] }));
  }
}
