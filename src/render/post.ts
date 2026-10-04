import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GRADE, VOLUMETRICS } from '../config';
import type { GpuTimer } from '../debug/gpu-timer';
import type { SurfaceMaterial } from '../materials';
import type { Lighting } from './lighting';
import { Volumetrics } from './volumetrics';

// Frame pipeline at the internal (pixelated) resolution:
//  1. scene -> linear HDR target with a depth texture (opaque draws front to back)
//  2. volumetrics (optional, lower res) read that depth
//  3. view model (hands + tool) drawn into the same target after a depth clear
//  4. final pass to the screen: + volumetric light (world pixels only: depth
//     still 1 after the clear), color grading, linear -> sRGB
// Steps 1 and 3 used to go straight to the screen; the target + final pass
// cost one extra fullscreen pass at internal resolution.

const gradeShader = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tVol;
uniform vec2 uVolTexel;
uniform float uVolOn;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uBalance;
varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  if (uVolOn > 0.5) {
    // 4 bilinear taps = a soft 4x4 filter that hides the dither of the raymarch.
    vec2 o = uVolTexel * 0.5;
    vec3 vol = texture2D(tVol, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, -o.y)).rgb
             + texture2D(tVol, vUv + vec2(-o.x, o.y)).rgb + texture2D(tVol, vUv + vec2(o.x, o.y)).rgb;
    c += vol * 0.25 * step(0.99999, texture2D(tDepth, vUv).r);
  }
  c *= exp2(uExposure) * uBalance;
  c = toSRGB(max(c, 0.0));
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class PostPipeline {
  private target: THREE.WebGLRenderTarget;
  private volumetrics = new Volumetrics();
  private grade: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private size = new THREE.Vector2();
  private volDownscale = 0;
  /** Draw calls and triangles of the main scene pass (for the debug panel). */
  readonly sceneStats = { calls: 0, triangles: 0 };

  constructor(
    private renderer: THREE.WebGLRenderer,
    private timer: GpuTimer,
  ) {
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.NearestFilter;
    this.grade = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tVol: { value: this.volumetrics.target.texture },
        uVolTexel: { value: new THREE.Vector2() },
        uVolOn: { value: 0 },
        uExposure: { value: 0 },
        uContrast: { value: 1 },
        uSaturation: { value: 1 },
        uBalance: { value: new THREE.Vector3(1, 1, 1) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: gradeShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.grade);
    renderer.setOpaqueSort(frontToBack);
  }

  private resize() {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (s.equals(this.size) && this.volDownscale === VOLUMETRICS.downscale) return;
    this.size.copy(s);
    this.volDownscale = VOLUMETRICS.downscale;
    this.target.setSize(s.x, s.y);
    this.volumetrics.setSize(s.x, s.y);
    const t = this.volumetrics.target;
    this.grade.uniforms.uVolTexel.value.set(1 / t.width, 1 / t.height);
  }

  /** `allowVolumetrics` is false in build mode (daylight). */
  render(scene: THREE.Scene, viewScene: THREE.Scene, camera: THREE.PerspectiveCamera, lighting: Lighting, allowVolumetrics = true) {
    const r = this.renderer;
    this.resize();

    this.timer.begin('scene');
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    this.sceneStats.calls = r.info.render.calls;
    this.sceneStats.triangles = r.info.render.triangles;
    this.timer.end();

    const vol = VOLUMETRICS.enabled && allowVolumetrics;
    if (vol) {
      this.timer.begin('volumetrics');
      this.volumetrics.render(r, this.target.depthTexture!, camera, lighting);
      this.timer.end();
    }

    this.timer.begin('post');
    r.setRenderTarget(this.target);
    r.clearDepth();
    r.render(viewScene, camera);

    const u = this.grade.uniforms;
    u.uVolOn.value = vol ? 1 : 0;
    u.uExposure.value = GRADE.exposure;
    u.uContrast.value = GRADE.contrast;
    u.uSaturation.value = GRADE.saturation;
    whiteBalance(GRADE.temperature, GRADE.tint, u.uBalance.value);
    r.setRenderTarget(null);
    this.quad.render(r);
    this.timer.end();
  }
}

/**
 * Opaque draws grouped by base texture (surfaces with the same one share all
 * their state but the paint and light maps), each group front to back, so the
 * depth test rejects hidden pixels before the surface shader runs on them.
 * three's default sorts by material before depth, and every paint mesh has
 * its own material, which left the order random in depth.
 */
function frontToBack(a: SortItem, b: SortItem) {
  return (
    a.groupOrder - b.groupOrder ||
    a.renderOrder - b.renderOrder ||
    baseOf(a.material) - baseOf(b.material) ||
    // -1 / 1 rather than a.z - b.z: returning a fraction allocates on every comparison.
    (a.z < b.z ? -1 : a.z > b.z ? 1 : a.id - b.id)
  );
}
const baseOf = (m: THREE.Material) => (m as Partial<SurfaceMaterial>).baseTexture?.id ?? 0;
type SortItem = { groupOrder: number; renderOrder: number; material: THREE.Material; z: number; id: number };

/** Simple white balance: warm/cool on red-blue, tint on green, luminance kept. */
function whiteBalance(temperature: number, tint: number, out: THREE.Vector3) {
  out.set(1 + 0.25 * temperature, 1 - 0.2 * tint, 1 - 0.25 * temperature);
  const l = 0.2126 * out.x + 0.7152 * out.y + 0.0722 * out.z;
  return out.multiplyScalar(1 / l);
}
