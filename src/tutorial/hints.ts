// The hints, as data (types.ts). Their texts are in src/messages.ts.

import type { CapId } from '../config.ts';
import type { Tool } from '../inventory/tool.ts';
import { msgLines } from '../messages.ts';
import type { Cond, HintDef } from './types.ts';

const holding = (tool: Tool): Cond => ({ holding: tool });
/** A tool that paints in the current color. */
const colored: Cond = { any: [holding('can'), holding('marker'), holding('roller')] };

/**
 * A hint about a tool, built one way for all: wanted while the tool is in the inventory (and `show` holds, if given).
 * With the tool away it shows that tool's "take it" step first, then the hint; its time on screen counts only for
 * the hint itself.
 */
function forTool(id: string, tool: Tool, def: Pick<HintDef, 'rank' | 'lines' | 'done' | 'after'> & { show?: Cond }): HintDef {
  const { show, ...rest } = def;
  return { ...rest, id, show: show ? { all: [{ owns: tool }, show] } : { owns: tool }, steps: [{ lines: msgLines(`hint.${tool}Take`), until: holding(tool) }] };
}

/** A tool picked up: take it from its slot, then use it. */
const tool = (id: Exclude<Tool, 'can'>, learnt: Cond) => forTool(`tool.${id}`, id, { rank: 'tool', lines: msgLines(`hint.${id}`), done: { action: learnt } });

/** What a cap is for, the first time it's on the can in hand: a pickup leaves the cap on as it was. */
const capHint = (cap: CapId, lines: string[]): HintDef => ({ id: `cap.${cap}`, rank: 'moment', lines, show: { cap }, done: { shown: 'infoSeconds' } });

export const HINTS: HintDef[] = [
  {
    id: 'move',
    rank: 'basic',
    lines: msgLines('hint.move'),
    show: { playedFor: 'moveDelay' },
    done: { action: { total: 'moved', atLeast: 'moveMeters' } },
  },
  { id: 'jump', rank: 'basic', lines: msgLines('hint.jump'), show: { playedFor: 0 }, done: { action: { event: 'jumped' } }, after: ['move'] },
  { id: 'sprint', rank: 'basic', lines: msgLines('hint.sprint'), show: { playedFor: 0 }, done: { action: { total: 'sprinted', atLeast: 'sprintMeters' } }, after: ['jump'] },
  forTool('spray', 'can', { rank: 'basic', lines: msgLines('hint.spray'), done: { action: { total: 'used', tool: 'can', atLeast: 'spraySeconds' } }, after: ['sprint'] }),
  tool('marker', { total: 'used', tool: 'marker', atLeast: 'markerMeters' }),
  tool('ladder', { total: 'used', tool: 'ladder', atLeast: 1 }),
  forTool('ladder.move', 'ladder', { rank: 'tool', lines: msgLines('hint.ladderMove'), done: { shown: 'infoSeconds' }, after: ['tool.ladder'] }),
  forTool('ladder.shared', 'ladder', { rank: 'tool', lines: msgLines('hint.ladderShared'), done: { shown: 'infoSeconds' }, after: ['ladder.move'] }),
  tool('roller', { total: 'used', tool: 'roller', atLeast: 'rollerMeters' }),
  tool('sponge', { total: 'used', tool: 'sponge', atLeast: 'spongeMeters' }),
  forTool('sponge.crouch', 'sponge', { rank: 'tool', lines: msgLines('hint.spongeCrouch'), done: { action: { total: 'used', tool: 'sponge', crouched: true, atLeast: 'spongeMeters' } }, after: ['tool.sponge'] }),
  forTool('opacity', 'can', { rank: 'tool', lines: msgLines('hint.opacity'), done: { action: { total: 'opacitySet', atLeast: 'opacityPercent' } }, after: ['spray'] }),
  forTool('cap', 'can', { rank: 'tool', lines: msgLines('hint.cap'), show: { has: 'caps', atLeast: 2 }, done: { action: { event: 'capCycled' } } }),
  capHint('needle', msgLines('hint.capNeedle')),
  capHint('skinny', msgLines('hint.capSkinny')),
  capHint('soft', msgLines('hint.capSoft')),
  capHint('fat', msgLines('hint.capFat')),
  capHint('spray', msgLines('hint.capSpray')),
  {
    id: 'color',
    rank: 'tool',
    lines: msgLines('hint.color'),
    show: { all: [{ has: 'colors', atLeast: 2 }, colored] },
    done: { action: { any: [{ event: 'colorCycled' }, { event: 'colorPicked' }] } },
  },
  {
    id: 'ladder.climb',
    rank: 'context',
    lines: msgLines('hint.climb'),
    show: { near: 'ladder' },
    done: { action: { total: 'climbed', atLeast: 'climbMeters' } },
  },
];
