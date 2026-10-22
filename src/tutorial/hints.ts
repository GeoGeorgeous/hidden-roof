// The hints, as data (types.ts). Text: plain sentences; `{action}` becomes the action's key name in bold at display time.

import type { Tool } from '../inventory/tool.ts';
import type { Cond, HintDef } from './types.ts';

const holding = (tool: Tool): Cond => ({ holding: tool });
/** A tool that paints in the current color. */
const colored: Cond = { any: [holding('can'), holding('marker'), holding('roller')] };

/** A tool picked up: take it from its slot, then use it. */
function tool(id: Tool, slot: string, take: string, use: string[], learnt: Cond): HintDef {
  return {
    id: `tool.${id}`,
    rank: 'tool',
    lines: use,
    show: { got: id },
    done: { action: learnt },
    steps: [{ lines: [`Press {${slot}} to ${take}`], until: holding(id) }],
  };
}

export const HINTS: HintDef[] = [
  {
    id: 'move',
    rank: 'basic',
    lines: ['Press {forward} {left} {back} {right} to move', 'Hold {sprint} to run, press {jump} to jump'],
    show: { playedFor: 'moveDelay' },
    done: { action: { total: 'moved', atLeast: 'moveMeters' } },
  },
  {
    id: 'spray',
    rank: 'basic',
    lines: ['Press {use} to spray, {shake} to shake the can'],
    show: holding('can'),
    done: { action: { total: 'used', tool: 'can', atLeast: 'spraySeconds' } },
    after: ['move'],
  },
  tool('marker', 'slot2', 'take the marker', ['Press {use} to draw, {sizeDown} / {sizeUp} to change nib'], { total: 'used', tool: 'marker', atLeast: 'markerMeters' }),
  tool('ladder', 'slot3', 'take the stepladder', ['Press {use} to put it down, {prev} / {next} to turn it'], { total: 'used', tool: 'ladder', atLeast: 1 }),
  tool('roller', 'slot4', 'take the roller', ['Press {use} to roll, {sizeDown} / {sizeUp} to change width'], { total: 'used', tool: 'roller', atLeast: 'rollerMeters' }),
  tool('sponge', 'slot5', 'take the sponge', ['Press {use} to scrub paint off, {sizeDown} / {sizeUp} to change size'], { total: 'used', tool: 'sponge', atLeast: 'spongeMeters' }),
  {
    id: 'cap',
    rank: 'tool',
    lines: ['Press {sizeDown} / {sizeUp} to change the cap'],
    show: { all: [{ has: 'caps', atLeast: 2 }, holding('can')] },
    done: { action: { event: 'capCycled' } },
  },
  {
    id: 'color',
    rank: 'tool',
    lines: ['Scroll {prev} / {next} to change color'],
    show: { all: [{ has: 'colors', atLeast: 2 }, colored] },
    done: { shown: 'colorShown', action: { any: [{ event: 'colorCycled' }, { event: 'colorPicked' }] } },
  },
  {
    id: 'ladder.climb',
    rank: 'context',
    lines: ['Walk into the ladder or hold {jump} to climb', 'Hold {crouch} to stay on it'],
    show: { near: 'ladder' },
    done: { action: { total: 'climbed', atLeast: 'climbMeters' } },
  },
];
