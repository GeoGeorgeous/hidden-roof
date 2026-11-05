// What the tutorial is told and what a hint is made of. Data only: no DOM, no game imports beyond types.

import type { CapId, TUTORIAL } from '../config.ts';
import type { Action } from '../input.ts';
import type { Tool } from '../inventory/tool.ts';

/** What the game tells the tutorial: things that happened. */
export type Fact =
  | { type: 'moved'; meters: number }
  | { type: 'sprinted'; seconds: number }
  | { type: 'jumped' }
  /** m drawn, rolled or scrubbed, s sprayed on a surface, 1 = a stepladder placed. */
  | { type: 'used'; tool: Tool; amount: number; crouched?: boolean }
  | { type: 'colorCycled' }
  | { type: 'colorPicked' }
  | { type: 'capCycled' }
  | { type: 'opacitySet' }
  | { type: 'sized'; tool: Tool }
  | { type: 'climbed'; meters: number }
  /** Any bound action, from Input.justPressed. */
  | { type: 'pressed'; action: Action }
  | { type: 'screenshot' };

/** How things are this frame. */
export interface Snapshot {
  /** In hand. */
  tool: Tool | null;
  /** In the inventory. */
  tools: readonly Tool[];
  colors: number;
  caps: number;
  /** On the can. */
  cap: CapId;
  /** Within TUTORIAL.ladderRadius of a level ladder's climb volume, not on it. */
  nearLadder: boolean;
  onLadder: boolean;
}

/** A number, or the name of a TUTORIAL number. */
export type Amount = number | { [K in keyof typeof TUTORIAL]: (typeof TUTORIAL)[K] extends number ? K : never }[keyof typeof TUTORIAL];

/** A fixed vocabulary; a hint combines it, so a new hint is a new entry, not new code. */
export type Cond =
  /** The tool is in the inventory now. */
  | { owns: Tool }
  | { has: 'colors' | 'caps'; atLeast: number }
  /** In hand. */
  | { holding: Tool }
  /** On the can, the can in hand. */
  | { cap: CapId }
  /** The action went down since the hint was wanted. */
  | { pressed: Action }
  /** Near a ladder or on one. */
  | { near: 'ladder' }
  /** Summed over the facts since the hint was wanted. */
  | { total: 'moved' | 'sprinted' | 'used' | 'climbed'; tool?: Tool; crouched?: true; atLeast: Amount }
  /** A fact of this type since the hint was wanted. */
  | { event: Fact['type'] }
  /** Visible seconds of play. */
  | { playedFor: Amount }
  | { all: Cond[] }
  | { any: Cond[] };

/**
 * When a hint is learnt and goes. By time: shown this many visible seconds, whatever the player did. By action: the
 * condition has held TUTORIAL.fullHold. Both: whichever comes first. Neither can clear it before TUTORIAL.minShown.
 */
type Done = { shown: Amount; action?: Cond } | { shown?: Amount; action: Cond };

export type Rank = 'moment' | 'tool' | 'context' | 'basic';

export interface HintDef {
  /** Stored when learnt: 'move', 'tool.marker'. */
  id: string;
  /** Moment > new tool > context > basic. A moment is about what's in hand right now. It and a context hint leave, unlearnt, when `show` stops holding. */
  rank: Rank;
  /** Up to 3 lines; `{use}` is the action's key name in bold, resolved at display time (messages.ts resolveLine). */
  lines: string[];
  /** When it's wanted. */
  show: Cond;
  done: Done;
  /** Shown first, each until its condition holds; one already true is skipped. */
  steps?: { lines: string[]; until: Cond }[];
  /** Wanted only once these are learnt. */
  after?: string[];
}

/** The message layer, as far as hints need it (src/notify.ts has these). */
export interface Notes {
  set(note: { key: string; kind: 'hint'; rank: number; lines: string[] }): void;
  clear(key: string): void;
  ring(key: string, full: number | null): void;
}
