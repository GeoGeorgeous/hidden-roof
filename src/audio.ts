import { ATMOS, AUDIO } from './config';
import { playSiren } from './sirens';

// All sounds are synthesized: filtered noise for hiss/ambience/steps/rain,
// short resonant noise bursts for the mixing-ball rattle, a low noise rumble
// for thunder, a buzzing hum for nearby AC fans, and far sirens (sirens.ts). Gains follow AUDIO live
// (update() once per frame).


export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private hissGain!: GainNode;
  private hissFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private scribbleGain!: GainNode;
  private ambGain!: GainNode;
  private lfoGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private fanGain!: GainNode;
  private fanLevel = 0;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.masterGain;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Hiss: looped noise -> highpass + peaking -> gain.
    const hiss = this.loop();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    this.hissFilter = ctx.createBiquadFilter();
    this.hissFilter.type = 'peaking';
    this.hissFilter.frequency.value = 6000;
    this.hissFilter.gain.value = 8;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hiss.connect(hp).connect(this.hissFilter).connect(this.hissGain).connect(this.master);

    // Marker scribble: soft band-passed noise, level follows pen movement.
    const scr = this.loop();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    this.scribbleGain = ctx.createGain();
    this.scribbleGain.gain.value = 0;
    scr.connect(bp).connect(this.scribbleGain).connect(this.master);

    // Ambience: distant city rumble + wind.
    const amb = this.loop();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const ambGain = (this.ambGain = ctx.createGain());
    ambGain.gain.value = AUDIO.ambienceGain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = (this.lfoGain = ctx.createGain());
    lfoGain.gain.value = AUDIO.ambienceGain * 0.5;
    lfo.connect(lfoGain).connect(ambGain.gain);
    lfo.start();
    amb.connect(lp).connect(ambGain).connect(this.master);

    // Rain: a soft wash (bandpassed noise) plus a slow swell, so it breathes.
    const rain = this.loop();
    const hp2 = ctx.createBiquadFilter();
    hp2.type = 'highpass';
    hp2.frequency.value = 500;
    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'lowpass';
    this.rainFilter.frequency.value = AUDIO.rainTone;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const swell = ctx.createGain();
    const sLfo = ctx.createOscillator();
    sLfo.frequency.value = 0.11;
    const sDepth = ctx.createGain();
    sDepth.gain.value = 0.15;
    swell.gain.value = 0.85;
    sLfo.connect(sDepth).connect(swell.gain);
    sLfo.start();
    rain.connect(hp2).connect(this.rainFilter).connect(swell).connect(this.rainGain).connect(this.master);

    // Fan hum: a low buzz (motor) + band-passed noise (air), level set by distance.
    this.fanGain = ctx.createGain();
    this.fanGain.gain.value = 0;
    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.value = 58;
    const motorLp = ctx.createBiquadFilter();
    motorLp.type = 'lowpass';
    motorLp.frequency.value = 260;
    const motorGain = ctx.createGain();
    motorGain.gain.value = 0.35;
    motor.connect(motorLp).connect(motorGain).connect(this.fanGain);
    motor.start();
    const air = this.loop();
    const airBp = ctx.createBiquadFilter();
    airBp.type = 'bandpass';
    airBp.frequency.value = 700;
    airBp.Q.value = 0.7;
    air.connect(airBp).connect(this.fanGain);
    this.fanGain.connect(this.master);
  }

  /** Once per frame: apply AUDIO gains and the rain level. */
  update() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(AUDIO.masterGain, t, 0.05);
    this.ambGain.gain.setTargetAtTime(AUDIO.ambienceGain, t, 0.05);
    this.lfoGain.gain.setTargetAtTime(AUDIO.ambienceGain * 0.5, t, 0.05);
    const rain = ATMOS.rain ? AUDIO.rainGain * (0.35 + 0.65 * ATMOS.rainDensity) : 0;
    this.rainGain.gain.setTargetAtTime(rain, t, 0.4);
    this.rainFilter.frequency.setTargetAtTime(AUDIO.rainTone, t, 0.1);
    this.fanGain.gain.setTargetAtTime(this.fanLevel * AUDIO.fanGain, t, 0.15);
  }

  /** 0..1 loudness of the nearest fan (from its distance). */
  setFan(level: number) {
    this.fanLevel = level;
  }

  /** A raindrop hitting metal: a short resonant tick. pan -1..1 (left..right), level 0..1. */
  drop(pan: number, level: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.random() * 0.03;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    const g = AUDIO.metalGain * level * (0.4 + Math.random() * 0.6);
    // Thin sheet metal rings high; now and then a duller, hollow tonk.
    const hollow = Math.random() < 0.25;
    const f = hollow ? 900 + Math.random() * 700 : 3200 + Math.random() * 3800;
    this.burst(t, hollow ? 0.09 : 0.035 + Math.random() * 0.03, f, hollow ? 9 : 22, g, 'bandpass', p);
  }

  /** A police or fire siren passing far away. */
  siren() {
    if (this.ctx) playSiren(this.ctx, this.master, AUDIO.sirenGain);
  }

  /** Rolling thunder; distance 0 = close and sharp, 1 = far and soft. */
  thunder(distance: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const dur = 5 + distance * 3;
    const level = AUDIO.thunderGain * (1 - distance * 0.6);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 - distance * 600, t0);
    lp.frequency.exponentialRampToValueAtTime(120, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    // A crack (near strikes), then a few rolling swells that die away.
    g.gain.exponentialRampToValueAtTime(level * (distance < 0.4 ? 1 : 0.5), t0 + 0.05 + distance * 0.4);
    let t = t0 + 0.4 + distance * 0.4;
    for (let i = 0; i < 4; i++) {
      g.gain.exponentialRampToValueAtTime(level * (0.25 + Math.random() * 0.35) * (1 - i * 0.2), t + 0.3);
      t += 0.5 + Math.random() * 0.9;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.1);
  }

  private loop() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  /** level 0..1; tone 0 = bright (skinny cap) .. 1 = deep (fat cap). */
  setHiss(level: number, tone: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hissGain.gain.setTargetAtTime(level * AUDIO.hissGain, t, 0.02);
    this.hissFilter.frequency.setTargetAtTime(7500 - tone * 3500, t, 0.05);
  }

  setScribble(level: number) {
    if (!this.ctx) return;
    this.scribbleGain.gain.setTargetAtTime(level * 0.12, this.ctx.currentTime, 0.03);
  }

  /** Two-note chime for picking something up. */
  pickup() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = t0 + i * 0.08;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  private burst(when: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', out: AudioNode = this.master) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f).connect(g).connect(out);
    src.start(when, Math.random() * 1.5, dur + 0.05);
  }

  /** Mixing ball clacking inside the can. */
  rattle() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      const t = t0 + i * 0.06 + Math.random() * 0.015;
      this.burst(t, 0.04, 2600 + Math.random() * 1400, 9, 0.5);
      this.burst(t + 0.008, 0.03, 5200 + Math.random() * 1500, 12, 0.25);
    }
  }

  click() {
    if (!this.ctx) return;
    this.burst(this.ctx.currentTime, 0.03, 3500, 4, 0.35);
  }

  footstep(hard = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = AUDIO.footstepGain * (hard ? 1.8 : 1);
    this.burst(t, 0.09, 180 + Math.random() * 80, 1.2, g, 'lowpass');
    this.burst(t, 0.05, 1500 + Math.random() * 600, 1.5, g * 0.25);
  }
}
