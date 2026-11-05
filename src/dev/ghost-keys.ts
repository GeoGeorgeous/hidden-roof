import { GHOST } from '../config';
import type { Shot } from '../capture/captureMode';
import type { Input } from '../input';
import type { Ghost } from './ghost';

// The ghost (ghost.ts) from capture mode, where F3 doesn't open: recorded in
// capture's Record avatar view (first person with its key), played in the free
// view once there's a recording. Its keys are by the left hand on WASD, so the
// right stays on the mouse; capture-plate.ts shows them.

const K = GHOST.keys;

/** Each frame in capture mode: the keys pressed. */
export function ghostKeys(ghost: Ghost, input: Input, shot: Shot) {
  if (input.wasPressed(K.record)) {
    if (ghost.recording) ghost.stop();
    else if (shot === 'record') ghost.record();
  }
  if (shot !== 'free' || ghost.recording || !ghost.recorded) return;
  if (input.wasPressed(K.pause)) {
    if (ghost.playing) ghost.paused = !ghost.paused;
    else ghost.play();
  }
  GHOST.speeds.forEach((_, i) => {
    if (input.wasPressed(`Digit${i + 1}`)) ghost.pace = i;
  });
  if (input.wasPressed(K.restart)) ghost.play();
  if (input.wasPressed(K.clean)) ghost.clean();
}
