// GPU time per render pass via EXT_disjoint_timer_query_webgl2 (Chromium on
// desktop has it; elsewhere the readouts show "n/a"). Queries are read back a
// few frames later and smoothed; each frame's total goes to `onFrame` too (the
// performance test). Only one query can run at a time, so passes are timed
// back to back, never nested.

type Ext = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class GpuTimer {
  readonly supported: boolean;
  /** Smoothed milliseconds per label. */
  readonly ms: Record<string, number> = {};
  enabled = false;
  /** Frames polled so far: the number a frame's queries carry. */
  frame = 0;
  /** A frame's total GPU ms once all its queries are read (a few frames late); frames the GPU was disturbed in (disjoint) are left out. */
  onFrame: ((frame: number, ms: number) => void) | null = null;
  private ext: Ext | null;
  private pending: { label: string; q: WebGLQuery; frame: number }[] = [];
  private open: { label: string; q: WebGLQuery; frame: number } | null = null;
  /** The frame whose queries are being summed, for onFrame. */
  private sum = { frame: -1, ms: 0, bad: false };

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as Ext | null;
    this.supported = !!this.ext;
  }

  begin(label: string) {
    if (!this.enabled || !this.ext || this.open || this.pending.length > 24) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = { label, q, frame: this.frame };
  }

  end() {
    if (!this.open || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.open);
    this.open = null;
  }

  /** Call once per frame, after drawing. Does nothing (no GL calls) while no query is in flight. */
  poll() {
    const gl = this.gl;
    this.frame++;
    if (!this.ext || !this.pending.length) return;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const { label, q, frame } = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      // A later frame's query: the one summed is complete.
      if (frame !== this.sum.frame) this.closeFrame(frame);
      if (disjoint) this.sum.bad = true;
      else {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.ms[label] = this.ms[label] === undefined ? ms : this.ms[label] * 0.9 + ms * 0.1;
        this.sum.ms += ms;
      }
      gl.deleteQuery(q);
    }
    // All of the summed frame's queries are read once none of it is left in flight.
    if (!this.pending.some((p) => p.frame === this.sum.frame) && this.sum.frame < this.frame - 1) this.closeFrame(-1);
  }

  private closeFrame(next: number) {
    const s = this.sum;
    if (s.frame >= 0 && !s.bad) this.onFrame?.(s.frame, s.ms);
    this.sum = { frame: next, ms: 0, bad: false };
  }

  /** Total smoothed ms of these passes, or null before any result (or without timer queries). */
  total(labels: string[]) {
    const known = labels.filter((l) => this.ms[l] !== undefined);
    return known.length ? known.reduce((sum, l) => sum + this.ms[l], 0) : null;
  }

  read(label: string) {
    if (!this.supported) return 'n/a';
    const v = this.ms[label];
    return v === undefined ? '-' : `${v.toFixed(2)} ms`;
  }
}
