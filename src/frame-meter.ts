// Frames a second and the CPU time of a frame, for the HUD's performance
// lines and F3: start() as a frame's work begins, end() once it's drawn.

export class FrameMeter {
  fps = 0;
  /** CPU time of a frame (ms), smoothed. */
  frameMs = 0;
  private frames = 0;
  private time = 0;
  private started = 0;

  start() {
    this.started = performance.now();
  }

  /** `delta`: real time since the last frame (s), not the game's dt: that's clamped, which would overstate fps below 20. */
  end(delta: number) {
    this.frames++;
    this.time += delta;
    this.frameMs = this.frameMs * 0.9 + (performance.now() - this.started) * 0.1;
    if (this.time < 0.5) return;
    this.fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
  }
}
