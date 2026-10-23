// The hints, as data (types.ts). Their texts are in src/messages.ts.

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

export const HINTS: HintDef[] = [
  {
    id: 'move',
    rank: 'basic',
    lines: msgLines('hint.move'),
    show: { playedFor: 'moveDelay' },
    done: { action: { total: 'moved', atLeast: 'moveMeters' } },
  },
  forTool('spray', 'can', { rank: 'basic', lines: msgLines('hint.spray'), done: { action: { total: 'used', tool: 'can', atLeast: 'spraySeconds' } }, after: ['move'] }),
  tool('marker', { total: 'used', tool: 'marker', atLeast: 'markerMeters' }),
  tool('ladder', { total: 'used', tool: 'ladder', atLeast: 1 }),
  forTool('ladder.move', 'ladder', { rank: 'tool', lines: msgLines('hint.ladderMove'), done: { shown: 'infoSeconds' }, after: ['tool.ladder'] }),
  forTool('ladder.shared', 'ladder', { rank: 'tool', lines: msgLines('hint.ladderShared'), done: { shown: 'infoSeconds' }, after: ['ladder.move'] }),
  tool('roller', { total: 'used', tool: 'roller', atLeast: 'rollerMeters' }),
  tool('sponge', { total: 'used', tool: 'sponge', atLeast: 'spongeMeters' }),
  forTool('sponge.crouch', 'sponge', { rank: 'tool', lines: msgLines('hint.spongeCrouch'), done: { action: { total: 'used', tool: 'sponge', crouched: true, atLeast: 'spongeMeters' } }, after: ['tool.sponge'] }),
  forTool('pressure', 'can', { rank: 'context', lines: msgLines('hint.lowPressure'), show: { low: 'pressure' }, done: { action: { pressed: 'shake' } } }),
  forTool('cap', 'can', { rank: 'tool', lines: msgLines('hint.cap'), show: { has: 'caps', atLeast: 2 }, done: { action: { event: 'capCycled' } } }),
  {
    id: 'color',
    rank: 'tool',
    lines: msgLines('hint.color'),
    show: { all: [{ has: 'colors', atLeast: 2 }, colored] },
    done: { shown: 'colorShown', action: { any: [{ event: 'colorCycled' }, { event: 'colorPicked' }] } },
  },
  {
    id: 'ladder.climb',
    rank: 'context',
    lines: msgLines('hint.climb'),
    show: { near: 'ladder' },
    done: { action: { total: 'climbed', atLeast: 'climbMeters' } },
  },
];
