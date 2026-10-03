import { AUDIO } from './config';

// All sounds are synthesized: filtered noise for hiss/ambience/steps, short
// resonant noise bursts for the mixing-ball rattle.

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private hissGain!: GainNode;
  private hissFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;

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

    // Ambience: distant city rumble + wind.
    const amb = this.loop();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const ambGain = ctx.createGain();
    ambGain.gain.value = AUDIO.ambienceGain;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = AUDIO.ambienceGain * 0.5;
    lfo.connect(lfoGain).connect(ambGain.gain);
    lfo.start();
    amb.connect(lp).connect(ambGain).connect(this.master);
  }

  private loop() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  /** level 0..1. Fat cap sounds lower and broader. */
  setHiss(level: number, capIndex: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hissGain.gain.setTargetAtTime(level * AUDIO.hissGain, t, 0.02);
    this.hissFilter.frequency.setTargetAtTime(capIndex === 1 ? 4200 : 7000, t, 0.05);
  }

  private burst(when: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
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
    src.connect(f).connect(g).connect(this.master);
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
