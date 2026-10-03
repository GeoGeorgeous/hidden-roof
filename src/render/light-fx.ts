import * as THREE from 'three';
import { ATMOS, LIGHTS } from '../config';
import { syncAnchor, type LightAnchor } from '../level/build-prop';

// Cheap light tricks for every light prop, in two draw calls total:
//  - glow sprites at the lens: one Points batch, additive, soft round falloff,
//    bright when you look into the lens and gone when you see it from behind
//  - beams: one merged additive mesh, fading along the beam
// Rebuilt only when the level or a light setting changes.

const glowMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: { uScale: { value: 300 }, uStrength: { value: 1 }, uFogDensity: { value: ATMOS.fogDensity } },
  vertexShader: /* glsl */ `
    attribute float size;
    attribute vec3 color;
    attribute vec3 facing;
    uniform float uScale;
    uniform float uFogDensity;
    varying vec3 vColor;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float d = length(mv.xyz);
      // Fog eats far glows a bit less than surfaces so lights still read through the rain.
      // The lens only shows from the side it faces.
      vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
      // facing = 0: a bare bulb, visible from every side.
      float face = dot(facing, facing) < 0.25 ? 1.0 : smoothstep(-0.1, 0.5, dot(toCam, facing));
      vColor = color * face * exp(-uFogDensity * 0.6 * d);
      gl_PointSize = size * uScale / max(d, 0.1);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uStrength;
    varying vec3 vColor;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float a = pow(max(1.0 - r, 0.0), 2.2);
      gl_FragColor = vec4(vColor * a * uStrength, 1.0);
    }`,
});

const coneMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: { uStrength: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute vec3 color;
    attribute float along;
    varying vec3 vColor;
    varying float vAlong;
    varying vec3 vN;
    varying vec3 vView;
    void main() {
      vColor = color;
      vAlong = along;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uStrength;
    varying vec3 vColor;
    varying float vAlong;
    varying vec3 vN;
    varying vec3 vView;
    void main() {
      // Brighter near the lamp and where the beam is seen side-on.
      float edge = abs(dot(normalize(vN), normalize(vView)));
      float a = (1.0 - vAlong) * (1.0 - vAlong) * edge * 0.09 * uStrength;
      gl_FragColor = vec4(vColor * a, 1.0);
    }`,
});

export class LightFX {
  readonly root = new THREE.Group();
  private glows: THREE.Points | null = null;
  private cones: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** Call with the renderer's drawing-buffer height so sprite sizes match the view. */
  setViewHeight(px: number, fov: number) {
    glowMaterial.uniforms.uScale.value = px / (2 * Math.tan((fov * Math.PI) / 360));
  }

  update() {
    glowMaterial.uniforms.uStrength.value = ATMOS.practical;
    glowMaterial.uniforms.uFogDensity.value = ATMOS.fogDensity;
    coneMaterial.uniforms.uStrength.value = ATMOS.practical;
  }

  rebuild(anchors: LightAnchor[]) {
    for (const o of [this.glows, this.cones]) {
      if (!o) continue;
      o.geometry.dispose();
      this.root.remove(o);
    }
    this.glows = this.cones = null;
    for (const a of anchors) syncAnchor(a);

    // Tracking (CCTV) lights move and switch on and off: no baked glow or beam.
    anchors = anchors.filter((a) => !a.track);
    const glows = anchors.filter((a) => LIGHTS[a.kind].glow > 0).flatMap((a) => (a.glows ?? [a.pos]).map((p) => ({ a, p })));
    if (glows.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(glows.flatMap(({ p }) => p.toArray()), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(glows.flatMap(({ a }) => a.color.toArray()), 3));
      g.setAttribute('facing', new THREE.Float32BufferAttribute(glows.flatMap(({ a }) => (LIGHTS[a.kind].glowAllAround ? [0, 0, 0] : a.dir.toArray())), 3));
      g.setAttribute('size', new THREE.Float32BufferAttribute(glows.map(({ a }) => LIGHTS[a.kind].glow), 1));
      this.glows = new THREE.Points(g, glowMaterial);
      this.glows.frustumCulled = false;
      this.root.add(this.glows);
    }

    const geos = anchors.filter((a) => LIGHTS[a.kind].beam > 0).map(coneGeometry);
    if (geos.length) {
      const pos: number[] = [];
      const nrm: number[] = [];
      const col: number[] = [];
      const along: number[] = [];
      for (const g of geos) {
        pos.push(...g.pos);
        nrm.push(...g.nrm);
        col.push(...g.col);
        along.push(...g.along);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
      this.cones = new THREE.Mesh(geo, coneMaterial);
      this.cones.frustumCulled = false;
      this.cones.raycast = () => {};
      this.root.add(this.cones);
    }
  }
}

/** Open cone from the lamp along its direction (non-indexed triangles). */
function coneGeometry(a: LightAnchor) {
  const seg = 14;
  const spec = LIGHTS[a.kind];
  const len = spec.beam;
  // The visible beam is the bright core of the light's cone.
  const rad = Math.tan(Math.min(spec.spread * (1 - spec.softness * 0.5), 1.3)) * len;
  const dir = a.dir.clone().normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(dir);
  if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
  u.normalize();
  const v = dir.clone().cross(u).normalize();
  const tip = a.pos;
  const ring = (i: number) => {
    const t = (i / seg) * Math.PI * 2;
    return tip.clone().addScaledVector(dir, len).addScaledVector(u, Math.cos(t) * rad).addScaledVector(v, Math.sin(t) * rad);
  };
  const out = { pos: [] as number[], nrm: [] as number[], col: [] as number[], along: [] as number[] };
  for (let i = 0; i < seg; i++) {
    const p1 = ring(i);
    const p2 = ring(i + 1);
    const n = p1.clone().sub(tip).cross(p2.clone().sub(tip)).normalize();
    for (const [p, t] of [[tip, 0], [p1, 1], [p2, 1]] as const) {
      out.pos.push(p.x, p.y, p.z);
      out.nrm.push(n.x, n.y, n.z);
      out.col.push(a.color.r, a.color.g, a.color.b);
      out.along.push(t);
    }
  }
  return out;
}
