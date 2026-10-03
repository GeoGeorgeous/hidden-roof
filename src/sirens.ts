import { SIRENS } from './config';

// Far-off NYC sirens for the vibe: now and then a police car (electronic wail
// that breaks into a yelp) or a fire truck (the mechanical Q siren's slow
// growl) passes somewhere out in the city. Synthesized: a buzzy oscillator
// swept through the siren's pitch pattern, muffled by distance (lowpass),
// echoing off the streets (feedback delay), drifting across the stereo field
// with a slight Doppler drop, fading in and out.

/** Schedules sirens at random intervals; `onSiren` plays one. */
export class Sirens {
  onSiren: () => void = () => {};
  private next = 15 + Math.random() * 30;

  /** `active`: night only (not in build mode's daylight). */
  update(dt: number, active: boolean) {
    if (!active || !SIRENS.enabled) return;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = SIRENS.minInterval + Math.random() * Math.max(0, SIRENS.maxInterval - SIRENS.minInterval);
    this.onSiren();
  }
}

/** Pitch pattern (Hz over time) of one siren; `t` in seconds from its start. */
type Pattern = (t: number) => number;

/** Electronic wail: slow rise and fall, ~4 s a cycle. */
const wail: Pattern = (t) => {
  const p = (t % 4.2) / 4.2;
  const k = p < 0.45 ? Math.sin((p / 0.45) * (Math.PI / 2)) : Math.cos(((p - 0.45) / 0.55) * (Math.PI / 2));
  return 620 + 820 * k;
};
/** Yelp: the same sweep, about 3 per second. */
const yelp: Pattern = (t) => {
  const p = (t % 0.33) / 0.33;
  return 680 + 760 * (p < 0.5 ? p * 2 : 2 - p * 2);
};
/** Police: wail, a burst of yelp in the middle (the car hitting an intersection), wail again. */
const police = (yelpAt: number, yelpFor: number): Pattern => (t) => (t >= yelpAt && t < yelpAt + yelpFor ? yelp(t) : wail(t));
/** Fire truck Q siren: winds up slowly, holds, winds down; again and again. */
const fire: Pattern = (t) => {
  const p = t % 9;
  if (p < 3.5) return 260 + 900 * Math.sin((p / 3.5) * (Math.PI / 2));
  if (p < 4.5) return 1160;
  return 260 + 900 * Math.cos(((p - 4.5) / 4.5) * (Math.PI / 2));
};

/** One siren passing far away, into `out`. `gain` is AUDIO.sirenGain. */
export function playSiren(ctx: AudioContext, out: AudioNode, gain: number) {
  const t0 = ctx.currentTime;
  const isFire = Math.random() < 0.3;
  const dur = 14 + Math.random() * 10;
  const pattern = isFire ? fire : police(dur * (0.35 + Math.random() * 0.2), 2 + Math.random() * 2);
  const distance = 0.4 + Math.random() * 0.6; // 0 = a few blocks away .. 1 = across the river
  const doppler = [1.03, 0.97]; // coming, then going

  const osc = ctx.createOscillator();
  osc.type = isFire ? 'sawtooth' : 'square';
  const step = 0.03;
  const curve = new Float32Array(Math.ceil(dur / step) + 1);
  for (let i = 0; i < curve.length; i++) {
    const t = i * step;
    curve[i] = pattern(t) * (doppler[0] + (doppler[1] - doppler[0]) * (t / dur));
  }
  osc.frequency.setValueCurveAtTime(curve, t0, dur);

  // Distance: far sirens are duller and quieter.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400 - distance * 1500;
  lp.Q.value = 0.5;
  const body = ctx.createBiquadFilter(); // the horn speaker's honk
  body.type = 'peaking';
  body.frequency.value = 1100;
  body.Q.value = 1.2;
  body.gain.value = 6;

  // Fade in, hold, fade out as it passes.
  const env = ctx.createGain();
  const level = gain * (1 - distance * 0.55);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(level, t0 + dur * 0.35);
  env.gain.setValueAtTime(level, t0 + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // Drifts across the stereo field, from one side of the city to the other.
  const pan = ctx.createStereoPanner();
  const from = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.5);
  pan.pan.setValueAtTime(from, t0);
  pan.pan.linearRampToValueAtTime(-from * 0.6, t0 + dur);

  // Street echo: a short feedback delay, darker on every bounce.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.18 + Math.random() * 0.12;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 900;
  const wet = ctx.createGain();
  wet.gain.value = 0.6;

  osc.connect(body).connect(lp).connect(env).connect(pan);
  pan.connect(out);
  pan.connect(delay).connect(echoLp).connect(fb).connect(delay);
  echoLp.connect(wet).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  // Let the echo die out, then drop the graph.
  osc.onended = () => setTimeout(() => [osc, body, lp, env, pan, delay, fb, echoLp, wet].forEach((n) => n.disconnect()), 3000);
}
