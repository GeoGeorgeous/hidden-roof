import { ATMOS, AUDIO } from './config';
import { CITY, RAIN, RAIN_INDOORS, STORM, THUNDERS, loadRecording, playLoop } from './recordings';

// The city below, the rain and thunder are recordings (recordings.ts), and they
// change indoors (setIndoors). The rest is synthesized: filtered noise for
// hiss/steps, short resonant noise bursts for the mixing-ball rattle and a
// buzzing hum for nearby AC fans. Gains follow AUDIO live (update() once per frame).


/** The city's lowpass outdoors (Hz): above all it has. */
const OPEN_AIR = 20000;

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private hissGain!: GainNode;
  private hissFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private scribbleGain!: GainNode;
  private ambGain!: GainNode;
  private cityTone!: BiquadFilterNode;
  /** Each recording asked for, settling when it plays (true) or can't (false). */
  readonly recordings = new Map<string, Promise<boolean>>();
  private indoors = false;
  /** The city is here, or has had its time: the other recordings may start. */
  private cityDone = false;
  private thunders: AudioBuffer[] = [];
  private lastThunder = 0;
  private rainGain!: GainNode;
  private stormGain!: GainNode;
  private indoorRainGain!: GainNode;
  private fanGain!: GainNode;
  private fanLevel = 0;
  private recorded: MediaStreamAudioDestinationNode | null = null;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext({ sampleRate: AUDIO.sampleRate });
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

    // Ambience: the city at night, once its recording is here.
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = AUDIO.ambienceGain;
    this.cityTone = ctx.createBiquadFilter();
    this.cityTone.type = 'lowpass';
    this.cityTone.frequency.value = OPEN_AIR;
    this.ambGain.connect(this.cityTone).connect(this.master);
    this.play(CITY, this.ambGain);
    const waited = new Promise((done) => setTimeout(done, AUDIO.cityFirst * 1000));
    void Promise.race([this.recordings.get(CITY), waited]).then(() => (this.cityDone = true));

    // Rain: its recordings join the first time it rains (update()).
    const layer = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      return g;
    };
    this.rainGain = layer();
    this.stormGain = layer();
    this.indoorRainGain = layer();

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

  /** All of the game's sound as a track for a recording (capture/recorder.ts), as loud as it's heard; null before the first gesture starts the sound. */
  track() {
    if (!this.ctx) return null;
    if (!this.recorded) this.master.connect((this.recorded = this.ctx.createMediaStreamDestination()));
    return this.recorded.stream.getAudioTracks()[0];
  }

  /** Once per frame: apply AUDIO gains and the rain level; `paused` turns everything down. */
  update(paused: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(AUDIO.masterGain * (paused ? AUDIO.pausedGain : 1), t, 0.1);
    const fade = AUDIO.indoorFade;
    this.ambGain.gain.setTargetAtTime(AUDIO.ambienceGain * (this.indoors ? AUDIO.indoorCity : 1), t, fade);
    this.cityTone.frequency.setTargetAtTime(this.indoors ? AUDIO.indoorTone : OPEN_AIR, t, fade);
    if (ATMOS.rain && this.cityDone) {
      this.play(RAIN, this.rainGain);
      this.play(STORM, this.stormGain);
      for (const file of THUNDERS) this.keep(file);
      if (this.indoors) this.play(RAIN_INDOORS, this.indoorRainGain);
    }
    const rain = ATMOS.rain ? 0.35 + 0.65 * ATMOS.rainDensity : 0;
    const outside = this.indoors ? 0 : rain;
    this.rainGain.gain.setTargetAtTime(AUDIO.rainGain * outside, t, fade);
    this.stormGain.gain.setTargetAtTime(AUDIO.stormGain * rain, t, fade);
    this.indoorRainGain.gain.setTargetAtTime(this.indoors ? AUDIO.indoorRainGain * rain : 0, t, fade);
    this.fanGain.gain.setTargetAtTime(this.fanLevel * AUDIO.fanGain, t, 0.15);
  }

  /** A recording, the first time it's asked for. */
  private play(file: string, out: AudioNode) {
    if (!this.recordings.has(file)) this.recordings.set(file, playLoop(this.ctx!, file, out));
  }

  /** A roll of thunder, ready for when lightning asks, the first time it's asked for. */
  private keep(file: string) {
    if (this.recordings.has(file)) return;
    const buffer = loadRecording(this.ctx!, file);
    this.recordings.set(file, buffer.then((b) => !!b && !!this.thunders.push(b)));
  }

  /** In a marked room: the city dulls and the rain is heard from inside. */
  setIndoors(on: boolean) {
    this.indoors = on;
  }

  /** 0..1 loudness of the nearest fan (from its distance). */
  setFan(level: number) {
    this.fanLevel = level;
  }

  /** A roll of thunder, never the same twice running; distance 0 = close and sharp, 1 = far and soft. Indoors it's muffled like the city. */
  thunder(distance: number) {
    const level = AUDIO.thunderGain * (1 - distance * 0.6);
    if (!this.ctx || level <= 0 || !this.thunders.length) return;
    const ctx = this.ctx;
    this.lastThunder = (this.lastThunder + 1 + Math.floor(Math.random() * (this.thunders.length - 1))) % this.thunders.length;
    const src = ctx.createBufferSource();
    src.buffer = this.thunders[this.lastThunder];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = OPEN_AIR * (1 - distance * 0.9);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(lp).connect(g).connect(this.cityTone);
    src.start();
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
