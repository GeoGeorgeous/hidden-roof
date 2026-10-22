// The hints, as data (types.ts). Their texts are in src/messages.ts.

import type { Tool } from '../inventory/tool.ts';
import { msgLines } from '../messages.ts';
import type { Cond, HintDef } from './types.ts';

const holding = (tool: Tool): Cond => ({ holding: tool });
/** A tool that paints in the current color. */
const colored: Cond = { any: [holding('can'), holding('marker'), holding('roller')] };

/** A tool picked up: take it from its slot, then use it. */
function tool(id: Exclude<Tool, 'can'>, learnt: Cond): HintDef {
  return {
    id: `tool.${id}`,
    rank: 'tool',
    lines: msgLines(`hint.${id}`),
    show: { owns: id },
    done: { action: learnt },
    steps: [{ lines: msgLines(`hint.${id}Take`), until: holding(id) }],
  };
}

export const HINTS: HintDef[] = [
  {
    id: 'move',
    rank: 'basic',
    lines: msgLines('hint.move'),
    show: { playedFor: 'moveDelay' },
    done: { action: { total: 'moved', atLeast: 'moveMeters' } },
  },
  {
    id: 'spray',
    rank: 'basic',
    lines: msgLines('hint.spray'),
    show: holding('can'),
    done: { action: { total: 'used', tool: 'can', atLeast: 'spraySeconds' } },
    after: ['move'],
  },
  tool('marker', { total: 'used', tool: 'marker', atLeast: 'markerMeters' }),
  tool('ladder', { total: 'used', tool: 'ladder', atLeast: 1 }),
  {
    id: 'ladder.move',
    rank: 'context',
    lines: msgLines('hint.ladderMove'),
    show: holding('ladder'),
    done: { shown: 'infoSeconds' },
    after: ['tool.ladder'],
  },
  {
    id: 'ladder.shared',
    rank: 'context',
    lines: msgLines('hint.ladderShared'),
    show: holding('ladder'),
    done: { shown: 'infoSeconds' },
    after: ['ladder.move'],
  },
  tool('roller', { total: 'used', tool: 'roller', atLeast: 'rollerMeters' }),
  tool('sponge', { total: 'used', tool: 'sponge', atLeast: 'spongeMeters' }),
  {
    id: 'sponge.crouch',
    rank: 'context',
    lines: msgLines('hint.spongeCrouch'),
    show: holding('sponge'),
    done: { action: { total: 'used', tool: 'sponge', crouched: true, atLeast: 'spongeMeters' } },
    after: ['tool.sponge'],
  },
  {
    id: 'pressure',
    rank: 'context',
    lines: msgLines('hint.lowPressure'),
    show: { low: 'pressure' },
    done: { action: { pressed: 'shake' } },
  },
  {
    id: 'cap',
    rank: 'tool',
    lines: msgLines('hint.cap'),
    show: { all: [{ has: 'caps', atLeast: 2 }, holding('can')] },
    done: { action: { event: 'capCycled' } },
  },
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
