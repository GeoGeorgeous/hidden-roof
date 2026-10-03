import { THUNDER } from '../config';

// Lightning: at random intervals while it rains, a flash made of 2-4 quick
// pulses lights the sky, ambient and moon (so the volumetric fog lights up
// too); thunder follows after a delay that grows with distance, softer when
// farther. `flash` is read by main each frame.

interface Pulse {
  at: number;
  peak: number;
  decay: number;
}

export class Lightning {
  /** 0..1, current flash brightness. */
  flash = 0;
  /** Called when the thunder of a strike should start: distance 0 (near) .. 1 (far). */
  onThunder: (distance: number) => void = () => {};
  private next = this.interval();
  private time = 0;
  private pulses: Pulse[] = [];
  private thunderAt = -1;
  private thunderDist = 0;

  private interval() {
    return THUNDER.minInterval + Math.random() * Math.max(0, THUNDER.maxInterval - THUNDER.minInterval);
  }

  /** Strike now (debug button). */
  strike() {
    const d = Math.random();
    const n = 2 + Math.floor(Math.random() * 3);
    let at = this.time;
    this.pulses = [];
    for (let i = 0; i < n; i++) {
      this.pulses.push({ at, peak: (i === 0 ? 1 : 0.4 + Math.random() * 0.6) * (1 - d * 0.5), decay: 10 + Math.random() * 14 });
      at += 0.06 + Math.random() * 0.16;
    }
    this.thunderDist = d;
    this.thunderAt = this.time + THUNDER.minDelay + d * (THUNDER.maxDelay - THUNDER.minDelay);
    this.next = this.interval();
  }

  /** `raining`: strikes only happen while it rains (not in build mode's daylight). */
  update(dt: number, raining: boolean) {
    this.time += dt;
    if (raining && THUNDER.enabled) {
      this.next -= dt;
      if (this.next <= 0) this.strike();
    }
    let f = 0;
    for (const p of this.pulses) {
      const t = this.time - p.at;
      if (t >= 0) f = Math.max(f, p.peak * Math.exp(-t * p.decay));
    }
    this.flash = f;
    if (this.thunderAt >= 0 && this.time >= this.thunderAt) {
      this.thunderAt = -1;
      this.onThunder(this.thunderDist);
    }
  }
}
