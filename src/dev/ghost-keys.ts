import { GHOST } from '../config';
import type { Shot } from '../capture/captureMode';
import { keyName, label, type Input } from '../input';
import type { Ghost } from './ghost';

// The ghost (ghost.ts) from capture mode, where F3 doesn't open: recorded in
// capture's Record avatar view (first person with its key), played in the free
// view once there's a recording; its keys, and their lines on the plate. Keys
// and values come in bold, as on the plate. Dev tools only, so its text isn't
// in messages.ts: the player build leaves it out.

const K = GHOST.keys;
const key = (code: string) => `**${keyName(code)}**`;

/** Each frame in capture mode: the keys pressed, and the plate's lines. */
export function ghostKeys(ghost: Ghost, input: Input, shot: Shot): string[] {
  if (input.wasPressed(K.record)) {
    if (ghost.recording) ghost.stop();
    else if (shot === 'record') ghost.record();
  }
  const recording = ghost.recording ? [`● GHOST ${ghost.label} · ${key(K.record)} stops`] : [];
  if (shot === 'record') return [`Record avatar · **${label('captureView')}** first person`, ...(ghost.recording ? recording : [`${key(K.record)} records the avatar`])];
  if (shot === 'player' || ghost.recording) return recording;
  if (!ghost.recorded) return [];
  if (input.wasPressed(K.pause)) ghost.paused = !ghost.paused;
  if (input.wasPressed(K.speed)) ghost.faster();
  if (input.wasPressed(K.restart)) ghost.play();
  if (input.wasPressed(K.clean)) ghost.clean();
  return [
    `${key(K.pause)} ${ghost.paused ? 'ghost goes on' : 'holds the ghost'} · ${key(K.speed)} ghost speed **${ghost.speed}×**`,
    `${key(K.restart)} ghost from the start · ${key(K.clean)} ${ghost.cleaned ? 'ghost back' : 'clean wall'}`,
  ];
}
