import { CAPTURE } from '../config';
import { type Action, keyName, label } from '../input';
import { msg, msgLines } from '../messages';
import type { CaptureDev, Shot } from './captureMode';
import type { Flight } from './flight';

// What capture mode's plate says (overlay.ts shows it), one control a line.
// The free view has the most keys, so it shows what's going on, the camera's
// speed and smoothing, and the rest in groups only while CAPTURE.keys.help is
// held, those that work right now; first person has few and shows them all.
// Keys and values come in bold, between `**`.

const K = CAPTURE.keys;

export const b = (s: string | number) => `**${s}**`;
export const key = (code: string) => b(keyName(code));
/** An action's key as bound (Settings → Controls). */
export const bound = (action: Action) => b(label(action));
const gcd = (a: number, c: number): number => (c ? gcd(c, a % c) : a);
const ratio = ([w, h]: readonly [number, number]) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;

export interface PlateState {
  shot: Shot;
  speed: number;
  smoothing: number;
  size: readonly [number, number] | null;
  /** An index into CAPTURE.qualities. */
  quality: number;
  /** When the recording started (performance.now() ms), or null. */
  recording: number | null;
  /** The last try to record didn't start. */
  failed: boolean;
}

const leaving = () => [msg('capture.next', { view: bound('captureView') }), msg('capture.leave', { exit: bound('capture') })];
const speed = (state: PlateState) => msg('capture.speed', { speed: b(state.speed.toFixed(state.speed < 1 ? 2 : 1)) });
const smoothing = (state: PlateState) => msg('capture.smoothing', { less: key(K.smoothLess), more: key(K.smoothMore), smoothing: b(state.smoothing) });

function video({ size, quality }: PlateState) {
  return [
    msg('capture.frame', { frame: bound('captureSize'), size: b(size ? `${ratio(size)} ${size[0]}×${size[1]}` : msg('capture.window')) }),
    msg('capture.quality', { quality: bound('captureQuality'), name: b(msgLines('capture.qualities')[quality]), mbps: b(CAPTURE.qualities[quality]) }),
  ];
}

/** The flight's keys that work now. */
function flightKeys(flight: Flight) {
  const fly = key(K.fly);
  if (flight.flying) return [msg('capture.stopFlying', { fly })];
  const n = flight.points.length;
  return [
    msg('capture.addPoint', { add: key(K.addPoint), n: b(n) }),
    ...(n ? [msg('capture.removePoint', { remove: key(K.removePoint) })] : []),
    ...(n > 1 ? [msg('capture.fly', { fly })] : []),
    msg('capture.flightTime', { shorter: key(K.shorter), longer: key(K.longer), seconds: b(flight.seconds) }),
  ];
}

/** The free view, nothing held. */
function free(state: PlateState, flight: Flight) {
  const flying = flight.flying ? [msg('capture.flying', { t: b(flight.elapsed.toFixed(1)), seconds: b(flight.seconds) }), msg('capture.stopFlying', { fly: key(K.fly) })] : [];
  return [...flying, speed(state), smoothing(state), msg('capture.help', { help: key(K.help) })];
}

/** The free view's keys, in groups. */
function sheet(state: PlateState, flight: Flight, dev: CaptureDev | null) {
  return [
    ...leaving(),
    b(msg('capture.camera')),
    msg('capture.move', { keys: [K.forward, K.left, K.back, K.right].map(key).join('') }),
    msg('capture.upDown', { down: key(K.down), up: key(K.up) }),
    speed(state),
    smoothing(state),
    b(msg('capture.flight')),
    ...flightKeys(flight),
    ...(dev?.help() ?? []),
    b(msg('capture.video')),
    ...video(state),
  ];
}

function recordLine({ recording, failed }: PlateState) {
  const time = recording === null ? '' : new Date(performance.now() - recording).toISOString().slice(14, 19);
  return msg(time ? 'capture.recording' : failed ? 'capture.recordFailed' : 'capture.record', { time: b(time), record: bound('captureRecord') });
}

/** The plate's lines; `held`: its keys are asked for. */
export function plateLines(state: PlateState, flight: Flight, held: boolean, dev: CaptureDev | null) {
  const { shot } = state;
  const name = shot === 'dev' ? dev!.viewName : msg(shot === 'free' ? 'capture.free' : 'capture.player');
  const status = dev?.status(shot) ?? [];
  if (shot !== 'free') return [name, ...status, ...leaving(), ...video(state), recordLine(state)];
  return held ? [name, ...sheet(state, flight, dev), recordLine(state)] : [name, ...status, ...free(state, flight), recordLine(state)];
}
