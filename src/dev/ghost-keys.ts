import { GHOST } from '../config';
import type { Shot } from '../capture/captureMode';
import type { Input } from '../input';
import { session } from '../session';
import type { Ghost } from './ghost';

// The ghost (ghost.ts) from capture mode, where F3 doesn't open: recorded in
// capture's Record avatar view (first person with its key), played in the free
// view once there's a recording. Its keys are by the left hand on WASD, so the
// right stays on the mouse; capture-plate.ts shows them. Like the rest of the
// dev tools it's for single player: a session's wall isn't the ghost's to touch.

const K = GHOST.keys;

/** Each frame in capture mode: the keys pressed; the view to go to, once a take is done. */
export function ghostKeys(ghost: Ghost, input: Input, shot: Shot): Shot | void {
  if (session.multiplayer) return;
  if (input.wasPressed(K.record)) {
    if (ghost.recording) {
      ghost.stop();
      return shot === 'record' ? 'free' : undefined;
    }
    if (shot === 'record') ghost.record();
  }
  if (shot !== 'free' || ghost.recording || !ghost.recorded) return;
  K.speeds.forEach((code, i) => {
    if (input.wasPressed(code)) ghost.pace = i;
  });
  if (input.wasPressed(K.pause) && !ghost.cleaned) {
    if (ghost.playing && !ghost.ended) ghost.togglePause();
    else ghost.play();
  }
  if (input.wasPressed(K.restart)) ghost.play();
  if (input.wasPressed(K.clean)) ghost.clean();
}

/** Capture mode's view changed, or it was left (null): the player has the game again, so their wall comes back; a take goes on until capture mode is left. */
export function ghostLeft(ghost: Ghost, shot: Shot | null) {
  if (shot === null || (shot !== 'free' && !ghost.recording)) ghost.stop();
}
