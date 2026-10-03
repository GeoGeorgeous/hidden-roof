// GPU time per render pass via EXT_disjoint_timer_query_webgl2 (Chromium on
// desktop has it; elsewhere the readouts show "n/a"). Queries are read back a
// few frames later and smoothed. Only one query can run at a time, so passes
// are timed back to back, never nested.

type Ext = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

export class GpuTimer {
  readonly supported: boolean;
  /** Smoothed milliseconds per label. */
  readonly ms: Record<string, number> = {};
  enabled = false;
  private ext: Ext | null;
  private pending: { label: string; q: WebGLQuery }[] = [];
  private open: { label: string; q: WebGLQuery } | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as Ext | null;
    this.supported = !!this.ext;
  }

  begin(label: string) {
    if (!this.enabled || !this.ext || this.open || this.pending.length > 24) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.open = { label, q };
  }

  end() {
    if (!this.open || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.open);
    this.open = null;
  }

  /** Call once per frame. */
  poll() {
    const gl = this.gl;
    if (!this.ext) return;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const { label, q } = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.ms[label] = this.ms[label] === undefined ? ms : this.ms[label] * 0.9 + ms * 0.1;
      }
      gl.deleteQuery(q);
    }
  }

  read(label: string) {
    if (!this.supported) return 'n/a';
    const v = this.ms[label];
    return v === undefined ? '-' : `${v.toFixed(2)} ms`;
  }
}
