import * as THREE from 'three';
import { ATMOS } from './config';

// Overcast night sky dome: near-black zenith, city-lit haze at the horizon,
// a faint glow where the moon hides behind the clouds. Follows the camera.

export function makeSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(ATMOS.skyZenith) },
    uHorizon: { value: new THREE.Color(ATMOS.skyHorizon) },
    uFog: { value: new THREE.Color(ATMOS.fogColor) },
    uMoonDir: { value: new THREE.Vector3(...ATMOS.moonDir).normalize() },
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
      uniform vec3 uZenith, uHorizon, uFog, uMoonDir;
      uniform float uFlash;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h * 1.6, 0.0, 1.0), 0.7)) : uFog;
        float m = max(dot(d, uMoonDir), 0.0);
        col += vec3(0.55, 0.62, 0.75) * pow(m, 18.0) * 0.12;
        // Lightning lights the clouds, brightest around the zenith.
        col += vec3(0.62, 0.68, 0.85) * uFlash * (0.4 + 0.6 * clamp(h * 2.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
