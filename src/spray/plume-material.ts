import * as THREE from 'three';
import { SPRAY } from '../config';

// What a plume's specks are drawn with: soft round ones that start tiny, grow
// as the cloud spreads and fade out. Under a pixel they fade rather than
// vanish, so the plume reads as a haze. One draw call for a can's whole plume.

const vertex = /* glsl */ `
attribute float age;
attribute float size;
attribute float grow;
attribute float strength;
uniform float opacity;
uniform float scale;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // age: 0 at the nozzle, 1 when the speck is gone.
  float px = size * mix(1.0, grow, age) * scale / -mv.z;
  gl_PointSize = max(px, 1.0);
  vColor = color;
  // Under a pixel: fainter by its area, not bigger.
  vAlpha = min(opacity * strength, 1.0) * (1.0 - age) * min(px * px, 1.0);
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

export function plumeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 1 }, scale: { value: 1 } },
  });
}

/** Before each draw: F3's opacity, and the screen's height (point sizes are in pixels). */
export function updatePlume(m: THREE.ShaderMaterial, renderer: THREE.WebGLRenderer) {
  renderer.getDrawingBufferSize(buffer);
  m.uniforms.scale.value = buffer.y * 0.5;
  m.uniforms.opacity.value = SPRAY.plume.opacity;
}
