import { CAPTURE, GHOST } from '../config';
import type { PlateState } from '../capture/overlay';
import { b, bound, frameName, key } from '../capture/plate-text';
import type { Flight } from '../capture/flight';
import type { Input } from '../input';
import { msgLines } from '../messages';
import { session } from '../session';
import type { Ghost } from './ghost';

// Capture mode's plate with the dev tools (the player build keeps its own,
// capture/overlay.ts): one control a line. The free view has the most keys, so
// it shows what's going on, the camera's speed and smoothing, and the rest in
// groups only while GHOST.keys.help is held, those that work right now; the
// first-person views have few and show them all. Its text isn't in messages.ts:
// that's the texts players see, and all of messages.ts goes in the player build.

const C = CAPTURE.keys;
const K = GHOST.keys;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const VIEWS = { free: 'FREE CAMERA', record: 'RECORD AVATAR', player: 'FIRST PERSON' };

/** How the ghost is, in any view. */
function status(ghost: Ghost) {
  if (ghost.recording) return `● AVATAR ${clock(ghost.elapsed)}`;
  if (ghost.cleaned) return 'CLEAN WALL';
  if (ghost.ended) return `AVATAR done ${clock(ghost.length)}`;
  if (ghost.playing) return `AVATAR ${ghost.paused ? '❚❚' : '▶'} ${ghost.speed}× ${clock(ghost.elapsed)} / ${clock(ghost.length)}`;
  return ghost.recorded ? `AVATAR ready ${ghost.speed}× ${clock(ghost.length)}` : 'AVATAR none';
}

/** The keys for what comes next. */
function next(ghost: Ghost, shot: PlateState['shot']) {
  if (ghost.recording) return [`${key(K.record)} stop`];
  if (shot === 'record') return [`${key(K.record)} start${ghost.recorded ? `, in place of ${clock(ghost.length)}` : ''}`];
  if (shot !== 'free') return [];
  if (!ghost.recorded) return [`${bound('captureView')} then ${key(K.record)} records`];
  if (ghost.cleaned) return [`${key(K.clean)} back`];
  if (ghost.ended) return [`${key(K.restart)} again`];
  return ghost.playing ? [] : [`${key(K.pause)} plays`];
}

function going(ghost: Ghost, { shot }: PlateState) {
  return session.multiplayer ? [] : [status(ghost), ...next(ghost, shot)];
}

/** The free view's ghost keys that work now. */
function avatarKeys(ghost: Ghost) {
  if (session.multiplayer || ghost.recording || !ghost.recorded) return [];
  const restart = `${key(K.restart)} from the start`;
  if (ghost.cleaned) return [b('AVATAR'), `${key(K.clean)} back`, restart];
  return [b('AVATAR'), `${key(K.pause)} plays, holds`, `${K.speeds.map(key).join(' ')} speed ${GHOST.speeds.join(', ')}×`, restart, `${key(K.clean)} clean wall`];
}

/** The free view's flight keys that work now. */
function flightKeys(flight: Flight) {
  if (flight.flying) return [`${key(C.fly)} stops`];
  const n = flight.points.length;
  return [`${key(C.addPoint)} adds a point (${b(n)})`, ...(n ? [`${key(C.removePoint)} removes the last`] : []), ...(n > 1 ? [`${key(C.fly)} flies`] : []), `${key(C.shorter)} / ${key(C.longer)} time ${b(flight.seconds)} s`];
}

const leaving = () => [`${bound('captureView')} next view`, `${bound('capture')} leaves`];
const speedLine = (speed: number) => `Wheel speed ${b(speed.toFixed(speed < 1 ? 2 : 1))} m/s`;
const smoothingLine = (smoothing: number) => `${key(C.smoothLess)} / ${key(C.smoothMore)} smoothing ${b(smoothing)} s`;

function video({ size, quality }: PlateState) {
  return [`${bound('captureSize')} frame ${b(frameName(size))}`, `${bound('captureQuality')} quality ${b(msgLines('capture.qualities')[quality])}`];
}

/** The free view, nothing held. */
function free(ghost: Ghost, plate: PlateState, flight: Flight) {
  return [VIEWS.free, ...going(ghost, plate), ...(flight.flying ? [`FLYING ${flight.elapsed.toFixed(1)} / ${flight.seconds} s`, `${key(C.fly)} stops`] : []), speedLine(plate.speed), smoothingLine(plate.smoothing), `${key(K.help)} keys`];
}

/** The free view's keys, in groups. */
function sheet(ghost: Ghost, plate: PlateState, flight: Flight) {
  return [
    VIEWS.free,
    ...leaving(),
    b('CAMERA'),
    `${[C.forward, C.left, C.back, C.right].map(key).join('')} fly`,
    `${key(C.down)} / ${key(C.up)} down, up`,
    speedLine(plate.speed),
    smoothingLine(plate.smoothing),
    b('FLIGHT'),
    ...flightKeys(flight),
    ...avatarKeys(ghost),
    b('VIDEO'),
    ...video(plate),
  ];
}

/** The plate's lines, above its line for recording a video. */
export function capturePlate(ghost: Ghost, input: Input, plate: PlateState, flight: Flight) {
  if (plate.shot === 'free') return input.isDown(K.help) ? sheet(ghost, plate, flight) : free(ghost, plate, flight);
  return [VIEWS[plate.shot], ...going(ghost, plate), ...leaving(), ...video(plate)];
}
