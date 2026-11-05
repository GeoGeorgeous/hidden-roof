import { CAPTURE, GHOST } from '../config';
import type { PlateState } from '../capture/overlay';
import { frameName } from '../capture/overlay';
import type { Flight } from '../capture/flight';
import { keyName, label, type Action, type Input } from '../input';
import { msgLines } from '../messages';
import type { Ghost } from './ghost';

// Capture mode's plate with the dev tools (the player build keeps its own,
// capture/overlay.ts): one control a line. The free view has the most keys, so
// it shows what's going on, the camera's speed and smoothing, and the rest in
// groups only while GHOST.keys.help is held; the first-person views have few
// and show them all. Keys and values come in bold. Its text isn't in
// messages.ts: the player build leaves it out.

const C = CAPTURE.keys;
const K = GHOST.keys;
const b = (s: string | number) => `**${s}**`;
const key = (code: string) => b(keyName(code));
const bound = (action: Action) => b(label(action));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const VIEWS = { free: 'FREE CAMERA', record: 'RECORD AVATAR', player: 'FIRST PERSON' };

/** The ghost in the free view. */
function avatar(ghost: Ghost) {
  if (ghost.cleaned) return ['CLEAN WALL', `${key(K.clean)} back`];
  if (!ghost.playing) return ['AVATAR ready', `${key(K.pause)} plays`];
  return [`AVATAR ${ghost.paused ? '❚❚' : '▶'} ${ghost.speed}× ${clock(ghost.elapsed)} / ${clock(ghost.length)}`];
}

/** What's going on with the ghost. */
function going(ghost: Ghost, { shot }: PlateState) {
  if (ghost.recording) return [`● AVATAR ${clock(ghost.elapsed)}`, `${key(K.record)} stop`];
  if (shot === 'record') return [`${key(K.record)} start`];
  return shot === 'free' && ghost.recorded ? avatar(ghost) : [];
}

const leaving = () => [`${bound('captureView')} next view`, `${bound('capture')} leaves`];
const speedLine = (speed: number) => `Wheel speed ${b(speed.toFixed(speed < 1 ? 2 : 1))} m/s`;
const smoothingLine = (smoothing: number) => `${key(C.smoothLess)} / ${key(C.smoothMore)} smoothing ${b(smoothing)} s`;

function video({ size, quality }: PlateState) {
  return [`${bound('captureSize')} frame ${b(frameName(size))}`, `${bound('captureQuality')} quality ${b(msgLines('capture.qualities')[quality])}`];
}

/** The free view, nothing held. */
function free(ghost: Ghost, plate: PlateState, flight: Flight) {
  return [VIEWS.free, ...going(ghost, plate), ...(flight.flying ? [`FLYING ${flight.elapsed.toFixed(1)} / ${flight.seconds} s`] : []), speedLine(plate.speed), smoothingLine(plate.smoothing), `${key(K.help)} keys`];
}

/** The free view's keys, in groups. */
function sheet(plate: PlateState, flight: Flight) {
  return [
    VIEWS.free,
    ...leaving(),
    b('CAMERA'),
    `${[C.forward, C.left, C.back, C.right].map(key).join('')} fly`,
    `${key(C.down)} / ${key(C.up)} down, up`,
    speedLine(plate.speed),
    smoothingLine(plate.smoothing),
    b('FLIGHT'),
    `${key(C.addPoint)} adds a point (${b(flight.points.length)})`,
    `${key(C.removePoint)} removes the last`,
    `${key(C.fly)} flies`,
    `${key(C.shorter)} / ${key(C.longer)} time ${b(flight.seconds)} s`,
    b('AVATAR'),
    `${key(K.pause)} plays, holds`,
    `${GHOST.speeds.map((_, i) => b(i + 1)).join(' ')} speed ${GHOST.speeds.join(', ')}×`,
    `${key(K.restart)} from the start`,
    `${key(K.clean)} clean wall`,
    b('VIDEO'),
    ...video(plate),
  ];
}

/** The plate's lines, above its line for recording a video. */
export function capturePlate(ghost: Ghost, input: Input, plate: PlateState, flight: Flight) {
  if (plate.shot === 'free') return input.isDown(K.help) ? sheet(plate, flight) : free(ghost, plate, flight);
  return [VIEWS[plate.shot], ...going(ghost, plate), ...leaving(), ...video(plate)];
}
