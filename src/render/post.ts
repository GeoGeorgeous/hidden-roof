import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GRADE, INK, VOLUMETRICS } from '../config';
import type { GpuTimer } from '../debug/gpu-timer';
import { swingDepthMaterial, type SurfaceMaterial } from '../materials';
import type { Lighting } from './lighting';
import { compileQuad, Volumetrics } from './volumetrics';
import { composeShader, paperTexture, VIEW_DEPTH } from './ink/compose';
import { inkUniforms } from './ink/tone';
import { ChromaBloom, SBX } from '../sandbox/sandbox';

// Frame pipeline at the internal (pixelated) resolution:
//  1. scene -> linear HDR target with a depth texture (opaque draws front to back)
//  2. volumetrics (optional, lower res) read that depth
//  3. view model (hands + tool) drawn into the same target, its depth
//     squashed into [0, VIEW_DEPTH] so it is always in front of the world
//     yet still in the depth buffer (so it gets outlines too)
//  4. final pass to the screen (ink/compose.ts): pen outlines from the depth,
//     + volumetric light (world pixels only), paper grain, grading, -> sRGB

const bufferSize = new THREE.Vector2();

export class PostPipeline {
  private target: THREE.WebGLRenderTarget;
  private volumetrics = new Volumetrics();
  private bloom = new ChromaBloom();
  private grade: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  private size = new THREE.Vector2();
  private volDownscale = 0;
  private viewCamera = new THREE.PerspectiveCamera();
  /** Draw calls and triangles of the main scene pass (for the debug panel). */
  readonly sceneStats = { calls: 0, triangles: 0 };

  constructor(
    private renderer: THREE.WebGLRenderer,
    private timer: GpuTimer,
  ) {
    // Float depth: outlines read small depth differences, far away too.
    const depth = new THREE.DepthTexture(1, 1, THREE.FloatType);
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth });
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.NearestFilter;
    this.grade = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tVol: { value: this.volumetrics.target.texture },
        uVolTexel: { value: new THREE.Vector2() },
        uVolOn: { value: 0 },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uInkColor: inkUniforms.uInkColor,
        uOutline: { value: 1 },
        uCrease: { value: 1 },
        uOutlineFade: { value: 100 },
        uGrain: { value: 0 },
        tPaper: { value: paperTexture() },
        uExposure: { value: 0 },
        tBloom: { value: this.bloom.a.texture },
        uBloom: { value: 0 },
        uCoverInk: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: composeShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.grade);
    renderer.setOpaqueSort(frontToBack);
  }

  private resize() {
    const s = this.renderer.getDrawingBufferSize(bufferSize);
    if (s.equals(this.size) && this.volDownscale === VOLUMETRICS.downscale) return;
    this.size.copy(s);
    this.volDownscale = VOLUMETRICS.downscale;
    this.target.setSize(s.x, s.y);
    this.volumetrics.setSize(s.x, s.y);
    this.bloom.setSize(s.x, s.y);
    const t = this.volumetrics.target;
    this.grade.uniforms.uVolTexel.value.set(1 / t.width, 1 / t.height);
    this.grade.uniforms.uTexel.value.set(1 / s.x, 1 / s.y);
  }

  /**
   * Compile ahead, as they're drawn, the shaders of what isn't drawn yet: what
   * a setting turns on (rain, volumetrics), what's out of view, and what's
   * hidden until play (the tool in hand, the wall hand: `viewScene`, with its
   * own lights), and what is drawn outside the scenes (the final pass, the
   * moon's shadow pass). Compiled when first drawn instead, each stalls the
   * game (on Windows, up to a second or more). Done under the loading screen.
   */
  warm(scene: THREE.Scene, viewScene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    // compile() takes hidden objects too; of the lights, only those shown (their number is in the shaders).
    r.compile(scene, camera);
    r.compile(viewScene, camera);
    // The moon's shadow pass draws geometry with normals with the decor's depth material and the rest with three's own, turned inside out and without the scene's fog. Compiled as a pass of their own, with the scene's lights.
    const position = new THREE.BufferAttribute(new Float32Array(9), 3);
    const casters = new THREE.Group().add(
      new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', position).setAttribute('normal', position), swingDepthMaterial),
      new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', position), new THREE.MeshDepthMaterial({ side: THREE.BackSide })),
    );
    const fog = scene.fog;
    scene.fog = null;
    r.compile(casters, camera, scene);
    scene.fog = fog;
    r.setRenderTarget(null);
    compileQuad(r, this.grade, camera);
    this.volumetrics.warm(r, camera);
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
    r.render(viewScene, squashed(camera, this.viewCamera));

    const u = this.grade.uniforms;
    const bloomOn = SBX.on && SBX.bloom > 0;
    if (bloomOn) this.bloom.render(r, this.target.texture, u.uTexel.value);
    u.uBloom.value = bloomOn ? SBX.bloom : 0;
    u.uCoverInk.value = SBX.on ? SBX.paintCoversInk : 0;
    u.uVolOn.value = vol ? 1 : 0;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uOutline.value = INK.outline;
    u.uCrease.value = INK.crease;
    u.uOutlineFade.value = INK.outlineFade;
    u.uGrain.value = INK.grain;
    u.uExposure.value = GRADE.exposure;
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

/**
 * The camera with its depth range squashed into [0, VIEW_DEPTH]: clip z' =
 * s z + t w maps NDC z from [-1, 1] to [-1, -1 + 2 VIEW_DEPTH]. Still affine
 * in 1/z, so the outline pass reads it like any depth (after stretching it back).
 */
function squashed(camera: THREE.PerspectiveCamera, out: THREE.PerspectiveCamera) {
  out.copy(camera);
  const s = VIEW_DEPTH;
  const t = VIEW_DEPTH - 1;
  const e = out.projectionMatrix.elements;
  for (const c of [0, 4, 8, 12]) e[c + 2] = s * e[c + 2] + t * e[c + 3];
  out.projectionMatrixInverse.copy(out.projectionMatrix).invert();
  return out;
}

