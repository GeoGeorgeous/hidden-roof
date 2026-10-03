import * as THREE from 'three';

// Grid lines on the face under the cursor, fading out within a few meters, so
// the grid is only visible where you're building.

const RADIUS = 7;

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uCenter: { value: new THREE.Vector3() }, uRadius: { value: RADIUS } },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uCenter;
    uniform float uRadius;
    varying vec3 vWorld;
    void main() {
      float d = distance(vWorld, uCenter) / uRadius;
      float a = (1.0 - smoothstep(0.2, 1.0, d)) * 0.55;
      if (a <= 0.0) discard;
      gl_FragColor = vec4(1.0, 1.0, 1.0, a);
    }`,
});

export class CursorGrid {
  readonly lines: THREE.LineSegments;
  private key = '';

  constructor(scene: THREE.Scene) {
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 9;
    scene.add(this.lines);
  }

  set visible(v: boolean) {
    this.lines.visible = v;
  }

  /**
   * Show grid lines in the plane of the face at `point` with normal `n`.
   * `h` = horizontal spacing, `v` = vertical spacing (for wall faces).
   */
  update(point: THREE.Vector3, n: THREE.Vector3, h: number, v: number) {
    const top = Math.abs(n.y) > 0.5;
    const axis = top ? 'y' : Math.abs(n.x) > 0.5 ? 'x' : 'z';
    // In-plane world axes and spacings.
    const U = axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const W = axis === 'y' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const su = h;
    const sw = top ? h : v;
    const key = `${axis}|${su}|${sw}`;
    if (key !== this.key) {
      this.key = key;
      this.lines.geometry.dispose();
      this.lines.geometry = buildLines(U, W, su, sw);
    }
    const o = point.clone();
    const snapAxis = (vec: THREE.Vector3, s: number) => {
      const c = o.dot(vec);
      o.addScaledVector(vec, Math.round(c / s) * s - c);
    };
    snapAxis(U, su);
    snapAxis(W, sw);
    o.addScaledVector(n, 0.02);
    this.lines.position.copy(o);
    material.uniforms.uCenter.value.copy(point);
  }
}

function buildLines(U: THREE.Vector3, W: THREE.Vector3, su: number, sw: number) {
  const pos: number[] = [];
  const ku = Math.ceil(RADIUS / su);
  const kw = Math.ceil(RADIUS / sw);
  const push = (a: THREE.Vector3, b: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let i = -ku; i <= ku; i++) {
    push(U.clone().multiplyScalar(i * su).addScaledVector(W, -kw * sw), U.clone().multiplyScalar(i * su).addScaledVector(W, kw * sw));
  }
  for (let j = -kw; j <= kw; j++) {
    push(W.clone().multiplyScalar(j * sw).addScaledVector(U, -ku * su), W.clone().multiplyScalar(j * sw).addScaledVector(U, ku * su));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
