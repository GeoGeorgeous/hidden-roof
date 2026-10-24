import * as THREE from 'three';
import { FEEL } from './feel';

// Sandbox: spray particles drawn as paint mist instead of square points. Each
// point is a soft round speck that starts tiny at the nozzle, grows as it
// flies (the cloud spreads), thins out and hangs in the air a moment after the
// wall; specks under a pixel fade rather than vanish, so the jet reads as a
// haze. One draw call, as before.

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
  // age: 0..1 flying to the wall, 1..2 hanging in the air after it.
  float fly = min(age, 1.0);
  float rest = max(age - 1.0, 0.0);
  float px = size * (0.4 + 1.2 * seed) * mix(1.0, grow, fly) * (1.0 + 0.8 * rest) * scale / -mv.z;
  gl_PointSize = max(px, 1.0);
  vColor = color;
  // Under a pixel: fainter by its area, not bigger.
  vAlpha = opacity * (1.0 - 0.5 * fly) * (1.0 - rest) * min(px * px, 1.0);
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
