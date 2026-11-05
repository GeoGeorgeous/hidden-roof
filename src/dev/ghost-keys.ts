import { GHOST } from '../config';
import { keyName, type Input } from '../input';
import type { Ghost } from './ghost';

// The ghost (ghost.ts) from capture mode's free view, where F3 doesn't open:
// its keys, and their lines on the plate, once there's a recording. Keys and
// values come in bold, as on the plate. Dev tools only, so its text isn't in
// messages.ts: the player build leaves it out.

const K = GHOST.keys;
const key = (code: string) => `**${keyName(code)}**`;

/** Each frame in the free view: the keys pressed, and the plate's lines. */
export function ghostKeys(ghost: Ghost, input: Input): string[] {
  if (!ghost.recorded) return [];
  if (input.wasPressed(K.pause)) ghost.paused = !ghost.paused;
  if (input.wasPressed(K.speed)) ghost.faster();
  if (input.wasPressed(K.restart)) ghost.restart();
  if (input.wasPressed(K.clean)) ghost.clean();
  return [
    `${key(K.pause)} ${ghost.paused ? 'ghost goes on' : 'holds the ghost'} · ${key(K.speed)} ghost speed **${ghost.speed}×**`,
    `${key(K.restart)} ghost from the start · ${key(K.clean)} ${ghost.cleaned ? 'ghost back' : 'clean wall'}`,
  ];
}
