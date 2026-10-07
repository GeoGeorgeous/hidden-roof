import * as THREE from 'three';
import { moonDirection } from './render/moon';
import { inkUniforms } from './render/ink/tone';

// Sky dome: INK.sky, a touch darker straight up, and a faint pale disc where
// the moon hides behind the clouds. Lightning washes it brighter. Follows the camera.

export function makeSky() {
  const uniforms = {
    uSky: inkUniforms.uSky,
    uMoonDir: { value: moonDirection(new THREE.Vector3()) },
    /** Lightning: 0..1, set every frame by main. */
    uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSky, uMoonDir;
      uniform float uFlash;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = uSky * (1.0 - 0.07 * h * h);
        float m = max(dot(d, uMoonDir), 0.0);
        col = mix(col, vec3(1.0), smoothstep(0.9985, 0.999, m) * 0.6 + uFlash * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
