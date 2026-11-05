import { GHOST } from '../config';
import type { CaptureDev, Shot } from '../capture/captureMode';
import { b, bound, key } from '../capture/plate';
import type { Input } from '../input';
import { session } from '../session';
import type { Ghost } from './ghost';

// The ghost (ghost.ts) plugged into capture mode, where F3 doesn't open:
// recorded in a first-person view of its own, played in the free view once
// there's a recording. Its keys are by the left hand on WASD, so the right
// stays on the mouse. Like the rest of the dev tools it's for single player:
// a session's wall isn't the ghost's to touch. Its text isn't in messages.ts,
// which goes in the player build: no player sees it.

const K = GHOST.keys;
const SPEED_KEYS = GHOST.speeds.map((_, i) => `Digit${i + 1}`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function keys(ghost: Ghost, input: Input, shot: Shot): Shot | void {
  if (session.multiplayer) return;
  if (input.wasPressed(K.record)) {
    if (ghost.recording) {
      ghost.stop();
      return shot === 'dev' ? 'free' : undefined;
    }
    if (shot === 'dev') ghost.record();
  }
  if (shot !== 'free' || ghost.recording || !ghost.recorded) return;
  SPEED_KEYS.forEach((code, i) => {
    if (input.wasPressed(code)) ghost.pace = i;
  });
  if (input.wasPressed(K.pause) && !ghost.cleaned) {
    if (ghost.playing && !ghost.ended) ghost.togglePause();
    else ghost.play();
  }
  if (input.wasPressed(K.restart)) ghost.play();
  if (input.wasPressed(K.clean)) ghost.clean();
}

/** How the ghost is, in any view. */
function state(ghost: Ghost) {
  if (ghost.recording) return `● AVATAR ${clock(ghost.elapsed)}`;
  if (ghost.cleaned) return 'CLEAN WALL';
  if (ghost.ended) return `AVATAR done ${clock(ghost.length)}`;
  if (ghost.playing) return `AVATAR ${ghost.paused ? '❚❚' : '▶'} ${ghost.speed}× ${clock(ghost.elapsed)} / ${clock(ghost.length)}`;
  return ghost.recorded ? `AVATAR ready ${ghost.speed}× ${clock(ghost.length)}` : 'AVATAR none';
}

/** The key for what comes next. */
function next(ghost: Ghost, shot: Shot) {
  if (ghost.recording) return [`${key(K.record)} stop`];
  if (shot === 'dev') return [`${key(K.record)} start${ghost.recorded ? `, in place of ${clock(ghost.length)}` : ''}`];
  if (shot !== 'free') return [];
  if (!ghost.recorded) return [`${bound('captureView')} then ${key(K.record)} records`];
  if (ghost.cleaned) return [`${key(K.clean)} back`];
  if (ghost.ended) return [`${key(K.restart)} again`];
  return ghost.playing ? [] : [`${key(K.pause)} plays`];
}

/** Its keys that work now, as a group. */
function help(ghost: Ghost) {
  if (session.multiplayer || ghost.recording || !ghost.recorded) return [];
  const restart = `${key(K.restart)} from the start`;
  if (ghost.cleaned) return [b('AVATAR'), `${key(K.clean)} back`, restart];
  return [b('AVATAR'), `${key(K.pause)} plays, holds`, `${SPEED_KEYS.map(key).join(' ')} speed ${GHOST.speeds.join(', ')}×`, restart, `${key(K.clean)} clean wall`];
}

export function ghostCapture(ghost: Ghost): CaptureDev {
  return {
    viewName: 'RECORD AVATAR',
    keys: (input, shot) => keys(ghost, input, shot),
    // The player has the game again, so their wall comes back; a take goes on until capture mode is left.
    changed(shot) {
      if (shot === null || (shot !== 'free' && !ghost.recording)) ghost.stop();
    },
    status: (shot) => (session.multiplayer ? [] : [state(ghost), ...next(ghost, shot)]),
    help: () => help(ghost),
  };
}
