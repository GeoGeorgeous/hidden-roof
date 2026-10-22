// What the tutorial is told and what a hint is made of. Data only: no DOM, no game imports beyond types.

import type { TUTORIAL } from '../config.ts';
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
  /** The can's pressure is under PRESSURE.sputterThreshold (in hand or not). */
  lowPressure: boolean;
  colors: number;
  caps: number;
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
  /** The action went down since the hint was wanted. */
  | { pressed: Action }
  /** Near a ladder or on one. */
  | { near: 'ladder' }
  /** Summed over the facts since the hint was wanted. */
  | { total: 'moved' | 'sprinted' | 'used' | 'climbed'; tool?: Tool; crouched?: true; atLeast: Amount }
  /** The can is low on pressure. */
  | { low: 'pressure' }
  /** A fact of this type since the hint was wanted. */
  | { event: Fact['type'] }
  /** Visible seconds of play. */
  | { playedFor: Amount }
  | { all: Cond[] }
  | { any: Cond[] };

/**
 * When a hint is learnt and goes. By time: shown this many visible seconds, whatever the player did. By action: the
 * condition holds. Both: whichever comes first. Neither can clear it before TUTORIAL.minShown.
 */
type Done = { shown: Amount; action?: Cond } | { shown?: Amount; action: Cond };

export type Rank = 'tool' | 'context' | 'basic';

export interface HintDef {
  /** Stored when learnt: 'move', 'tool.marker'. */
  id: string;
  /** New tool > context > basic. A context hint leaves, unlearnt, when its `show` stops holding. */
  rank: Rank;
  /** Up to 3 lines; `{use}` is the action's key name in bold, resolved at display time (notify.ts resolveLine). */
  lines: string[];
  /** When it's wanted. */
  show: Cond;
  done: Done;
  /** Shown first, each until its condition holds; one already true is skipped. */
  steps?: { lines: string[]; until: Cond }[];
  /** Wanted only once these are learnt. */
  after?: string[];
}

/** The message layer, as far as hints need it (src/notify.ts has these two). */
export interface Notes {
  set(note: { key: string; kind: 'advice'; rank: number; lines: string[] }): void;
  clear(key: string): void;
}
