// All tunable constants live here. Units: meters, seconds, radians unless noted.

export const RENDER = {
  /** Internal resolution divisor. 2 = render at half res and upscale with nearest filtering. */
  pixelScale: 2.5,
  fov: 75,
  fogNear: 40,
  fogFar: 260,
};

export const PAINT = {
  /** Texel density of every paintable surface (paint + base textures). */
  texelsPerMeter: 16,
  /** Paint color (single fixed color in v1). */
  color: [236, 64, 122] as [number, number, number],
  /** Alpha is quantized to this many steps in the shader for a chunky look (0 = off). */
  alphaSteps: 5,
  /** Hard cap on a single surface atlas side, in texels. */
  maxTextureSize: 2048,
};

export interface CapSpec {
  name: string;
  /** Half-angle of the spray cone. */
  coneAngle: number;
  /** Particles per second at full flow. */
  rate: number;
  /** Alpha deposited per particle at full flow. */
  strength: number;
  /** Stamp radius in texels (0 = one texel). */
  stampRadius: number;
  /** Hiss loudness multiplier. */
  hissGain: number;
}

export const CAPS: CapSpec[] = [
  { name: 'THIN', coneAngle: 0.035, rate: 260, strength: 0.16, stampRadius: 0, hissGain: 0.6 },
  { name: 'FAT', coneAngle: 0.12, rate: 520, strength: 0.1, stampRadius: 1, hissGain: 1.0 },
];

export const SPRAY = {
  /** Max distance paint can travel. */
  range: 3.5,
  /** Paint strength fades linearly from this distance to `range`. */
  falloffStart: 1.5,
  particleSpeed: 11,
  particleSize: 0.035,
  maxParticles: 3000,
};

export const PRESSURE = {
  /** Pressure lost per second of spraying (1 = full can). */
  drainPerSecond: 0.04,
  /** Below this, paint gets thinner. */
  thinThreshold: 0.5,
  /** Below this, the can sputters. */
  sputterThreshold: 0.25,
  /** Flow at the sputter threshold (flow ramps 1 -> this between the thresholds). */
  minSteadyFlow: 0.4,
  /** Fraction of time the can actually fires while sputtering. */
  sputterDuty: 0.45,
  /** Pressure restored by one shake (clamped to 1). */
  shakeRestore: 0.3,
  shakeDuration: 0.55,
};

export const PLAYER = {
  eyeHeight: 1.62,
  height: 1.78,
  radius: 0.3,
  walkSpeed: 4.2,
  sprintSpeed: 6.5,
  groundAccel: 14,
  airAccel: 3,
  jumpSpeed: 6.9,
  gravity: 21,
  stepHeight: 0.42,
  climbSpeed: 2.6,
  mouseSensitivity: 0.0022,
  /** Falling below this height respawns the player. */
  killY: -25,
};

export const AUDIO = {
  masterGain: 0.7,
  hissGain: 0.22,
  ambienceGain: 0.05,
  footstepGain: 0.25,
};
