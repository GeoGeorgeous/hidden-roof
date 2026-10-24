import * as THREE from 'three';
import { FEEL } from './feel';

// Sandbox: the spray plume at the nozzle (particles.ts) drawn as atomized
// paint instead of square points: soft round specks that start tiny, grow as
// the cloud spreads and fade out; specks under a pixel fade rather than
// vanish, so the plume reads as a haze. One draw call, as before.

const vertex = /* glsl */ `
attribute float age;
attribute float seed;
uniform float size;
uniform float grow;
uniform float opacity;
uniform float scale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // age: 0 at the nozzle, 1 when the speck is gone.
  float px = size * (0.4 + 1.2 * seed) * mix(1.0, grow, age) * scale / -mv.z;
  gl_PointSize = max(px, 1.0);
  vColor = color;
  // Under a pixel: fainter by its area, not bigger.
  vAlpha = opacity * (1.0 - age) * min(px * px, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = vAlpha * (1.0 - d) * (1.0 - d);
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

const buffer = new THREE.Vector2();

export function mistMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: { size: { value: 0 }, grow: { value: 1 }, opacity: { value: 1 }, scale: { value: 1 } },
  });
}

/** Before each draw: the panel's values and the screen's height (point sizes are in pixels). */
export function updateMist(m: THREE.ShaderMaterial, renderer: THREE.WebGLRenderer) {
  renderer.getDrawingBufferSize(buffer);
  m.uniforms.scale.value = buffer.y * 0.5;
  m.uniforms.size.value = FEEL.mistSize;
  m.uniforms.grow.value = FEEL.mistGrow;
  m.uniforms.opacity.value = FEEL.mistOpacity;
}
