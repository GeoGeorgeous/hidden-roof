import { PRESSURE } from './config';

// DOM HUD: crosshair, cap + pressure, start overlay, and a debug overlay.

export interface DebugStats {
  fps: number;
  frameMs: number;
  textures: number;
  textureBytes: number;
  surfaces: number;
  uploads: number;
  uploadBytes: number;
  drawCalls: number;
  particles: number;
}

export class Hud {
  private cap: HTMLElement;
  private bar: HTMLElement;
  private barWrap: HTMLElement;
  private overlay: HTMLElement;
  private debug: HTMLElement;
  debugVisible = false;

  constructor() {
    const root = el('div', 'hud');
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="can">
        <div class="cap"></div>
        <div class="pressure"><div class="bar"></div><div class="mark" style="left:${PRESSURE.thinThreshold * 100}%"></div><div class="mark" style="left:${PRESSURE.sputterThreshold * 100}%"></div></div>
      </div>
      <pre class="debug" hidden></pre>
      <div class="overlay">
        <h1>TAGGIN'</h1>
        <p>click to play</p>
        <table>
          <tr><td>WASD</td><td>move</td></tr>
          <tr><td>SPACE</td><td>jump</td></tr>
          <tr><td>SHIFT</td><td>run</td></tr>
          <tr><td>W / S on ladder</td><td>climb</td></tr>
          <tr><td>LMB</td><td>spray</td></tr>
          <tr><td>WHEEL</td><td>switch cap</td></tr>
          <tr><td>G</td><td>shake can</td></tr>
          <tr><td>F3 / \`</td><td>debug</td></tr>
        </table>
      </div>`;
    document.body.appendChild(root);
    this.cap = root.querySelector('.cap')!;
    this.bar = root.querySelector('.bar')!;
    this.barWrap = root.querySelector('.pressure')!;
    this.overlay = root.querySelector('.overlay')!;
    this.debug = root.querySelector('.debug')!;
  }

  setLocked(locked: boolean) {
    this.overlay.hidden = locked;
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debug.hidden = !this.debugVisible;
  }

  update(capName: string, pressure: number) {
    this.cap.textContent = `${capName} CAP`;
    this.bar.style.width = `${(pressure * 100).toFixed(1)}%`;
    const state = pressure < PRESSURE.sputterThreshold ? 'low' : pressure < PRESSURE.thinThreshold ? 'mid' : 'ok';
    this.barWrap.dataset.state = state;
  }

  updateDebug(s: DebugStats) {
    if (!this.debugVisible) return;
    this.debug.textContent = [
      `fps        ${s.fps.toFixed(0)}  (${s.frameMs.toFixed(1)} ms)`,
      `paint tex  ${s.textures} / ${s.surfaces} surfaces`,
      `tex memory ${(s.textureBytes / (1024 * 1024)).toFixed(2)} MB`,
      `uploads    ${s.uploads} tex, ${(s.uploadBytes / 1024).toFixed(1)} KB this frame`,
      `draw calls ${s.drawCalls}`,
      `particles  ${s.particles}`,
    ].join('\n');
  }
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
