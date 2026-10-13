import * as THREE from 'three';
import { CCTV, RENDER } from '../config';

// CCTV heads pan slowly; when the player comes near they turn to follow the player,
// and the lens and a small spot light switch on. The head turns in the vertex
// shader (so it stays in the level-wide decor batches); the light is aimed on
// the CPU with the exact same math (trackAngle / trackPitch / trackWeight below
// mirror the GLSL), from the same clock and the same player position. Besides
// panning, the head tilts up or down to the player's height.

export const TRACK_GLSL = /* glsl */ `
uniform vec3 uPlayer;
uniform float uTrackNear;
uniform float uTrackFar;
uniform float uTrackMax;
uniform float uTrackTilt;
/** 1, or 0 with RENDER.propMotion off: swinging and spinning parts stay at rest. */
uniform float uMotion;
float trackRel(vec3 pivot, vec2 fwd) {
  vec2 d = uPlayer.xz - pivot.xz;
  float rel = atan(d.x, d.y) - atan(fwd.x, fwd.y);
  return mod(rel + 3.14159265, 6.2831853) - 3.14159265;
}
/** 0 far away or behind the wall .. 1 close and in view. */
float trackWeight(vec3 pivot, vec2 fwd) {
  float near = 1.0 - smoothstep(uTrackNear, uTrackFar, distance(uPlayer.xz, pivot.xz));
  float inView = 1.0 - smoothstep(uTrackMax, uTrackMax + 0.35, abs(trackRel(pivot, fwd)));
  return near * inView;
}
/** Elevation of the player seen from the pivot, within +-uTrackTilt. */
float trackPitch(vec3 pivot) {
  float e = atan(uPlayer.y - pivot.y, max(distance(uPlayer.xz, pivot.xz), 0.01));
  return clamp(e, -uTrackTilt, uTrackTilt);
}
/** Tilt v (already panned by yaw a) up by the pitch, around the horizontal axis across the facing. */
vec3 trackTilt(vec3 v, float a, vec3 pivot, vec2 fwd) {
  float c = cos(a), s = sin(a);
  vec2 f = vec2(c * fwd.x + s * fwd.y, -s * fwd.x + c * fwd.y);
  vec3 k = vec3(f.y, 0.0, -f.x);
  float p = -trackPitch(pivot) * trackWeight(pivot, fwd) * uMotion;
  return v * cos(p) + cross(k, v) * sin(p) + k * dot(k, v) * (1.0 - cos(p));
}
float trackAngle(float sweep, vec3 pivot, vec2 fwd) {
  return mix(sweep, clamp(trackRel(pivot, fwd), -uTrackMax, uTrackMax), trackWeight(pivot, fwd));
}
`;

/** Shared uniforms for TRACK_GLSL (merged into materials' shared uniforms). */
export const trackUniforms = {
  uPlayer: { value: new THREE.Vector3(0, -1000, 0) },
  uTrackNear: { value: CCTV.lockRange },
  uTrackFar: { value: CCTV.followRange },
  uTrackMax: { value: CCTV.maxTurn },
  uTrackTilt: { value: CCTV.maxTilt },
  uMotion: { value: 1 },
};

export function syncTrackUniforms(player: THREE.Vector3) {
  trackUniforms.uPlayer.value.copy(player);
  trackUniforms.uTrackNear.value = CCTV.lockRange;
  trackUniforms.uTrackFar.value = Math.max(CCTV.followRange, CCTV.lockRange + 0.01);
  trackUniforms.uTrackMax.value = CCTV.maxTurn;
  trackUniforms.uTrackTilt.value = CCTV.maxTilt;
  trackUniforms.uMotion.value = RENDER.propMotion ? 1 : 0;
}

/** A tracking head: world pivot, rest facing (xz), and its idle sweep. */
export interface Track {
  pivot: THREE.Vector3;
  fwd: THREE.Vector2;
  amp: number;
  speed: number;
  phase: number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mod = (x: number, y: number) => x - y * Math.floor(x / y);

function rel(t: Track, player: THREE.Vector3) {
  const r = Math.atan2(player.x - t.pivot.x, player.z - t.pivot.z) - Math.atan2(t.fwd.x, t.fwd.y);
  return mod(r + Math.PI, Math.PI * 2) - Math.PI;
}

export function trackWeight(t: Track, player: THREE.Vector3) {
  const u = trackUniforms;
  const near = 1 - smoothstep(u.uTrackNear.value, u.uTrackFar.value, Math.hypot(player.x - t.pivot.x, player.z - t.pivot.z));
  const max = u.uTrackMax.value;
  return near * (1 - smoothstep(max, max + 0.35, Math.abs(rel(t, player))));
}

/** Head yaw (radians, around +y as in the swing shader) at `time`. */
export function trackAngle(t: Track, time: number, player: THREE.Vector3) {
  const sweep = t.amp * Math.sin(time * t.speed + t.phase);
  const max = trackUniforms.uTrackMax.value;
  const target = Math.min(max, Math.max(-max, rel(t, player)));
  return THREE.MathUtils.lerp(sweep, target, trackWeight(t, player)) * trackUniforms.uMotion.value;
}

/** Rotate v (relative to the pivot) by the swing shader's y rotation. */
export function rotateY(v: THREE.Vector3, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return v.set(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

/** Head tilt (radians, up positive) toward the player's height, 0 while the head isn't following. */
export function trackPitch(t: Track, player: THREE.Vector3) {
  const max = trackUniforms.uTrackTilt.value;
  const e = Math.atan2(player.y - t.pivot.y, Math.max(Math.hypot(player.x - t.pivot.x, player.z - t.pivot.z), 0.01));
  return Math.min(max, Math.max(-max, e)) * trackWeight(t, player) * trackUniforms.uMotion.value;
}

const tiltAxis = new THREE.Vector3();
/** Tilt v (already panned by `yaw`) up by `pitch` around the horizontal axis across the head's facing. */
export function tilt(v: THREE.Vector3, t: Track, yaw: number, pitch: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  tiltAxis.set(-s * t.fwd.x + c * t.fwd.y, 0, -(c * t.fwd.x + s * t.fwd.y));
  return v.applyAxisAngle(tiltAxis, -pitch);
}
