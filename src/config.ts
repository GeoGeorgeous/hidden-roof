// All tunable constants live here. Units: meters, seconds, radians unless noted.

export const RENDER = {
  /** Internal resolution divisor. 2 = render at half res and upscale with nearest filtering. */
  pixelScale: 1,
  fov: 80,
  /** Extra FOV (degrees) while sprinting, eased in and out. */
  sprintFovBoost: 6,
  sprintFovEase: 8,
  /**
   * Decor and shadow batches are merged per tile of this many meters (x, z):
   * smaller = cheaper edits and finer culling, but more draw calls. Read when
   * the level changes.
   */
  batchTile: 32,
};

/** Rainy night. Colors are hex; everything else is live-tunable in the debug panel. */
export const ATMOS = {
  skyZenith: '#343c4b',
  skyHorizon: '#080b11',
  fogColor: '#0e131a',
  /** Exponential fog density (1/m). */
  fogDensity: 0.009,
  /** Low clouds: everything above this height (relative to the level) fades into them. */
  cloudBase: 35,
  cloudFade: 40,
  cloudColor: '#080b07',
  ambientSky: '#7889ab',
  ambientGround: '#000000',
  ambient: 1,
  moonColor: '#777698',
  moon: 1.4,
  moonDir: [-0.35, 0.85, -0.4] as [number, number, number],
  shadows: true,
  /** Real spot lights may cast shadow-map shadows (2 slots, kinds with `shadows`). Only while lamps aren't baked (LIGHTMAP.enabled off). */
  spotShadows: false,
  /** Half-size of the moon shadow area around the player, in meters. */
  shadowRange: 32,
  /** Multiplier for all light props. */
  practical: 2,
  /** While lamps aren't baked (LIGHTMAP.enabled off): real lights handed to the nearest light props (others use glow tricks only). */
  lightBudget: 8,
  /** Distance falloff exponent of light props: 2 = physical inverse square, lower reaches further. */
  lightDecay: 2,
  windowGlow: 0.25,
  /** Brightness of emissive surfaces (lamps, neon). */
  emissiveBoost: 1.8,
  /** A little self-light on paint so graffiti reads in the dark. */
  paintGlow: 0,
  /** Wet look on up-facing surfaces: darker + specular. */
  wetness: 0.15,
  rain: true,
  /** Fraction of the maximum drop count. */
  rainDensity: 0.09,
  rainSpeed: 8,
  /** Raindrop color, and how visible the drops are (multiplier, 1 = default). */
  rainColor: '#b7c4e0',
  rainOpacity: 1,
  wind: [-3, 0, -2] as [number, number, number],
};

/** Practical light kinds; every light prop uses one (see kit/lights.ts). */
export type LightKind = 'wallLamp' | 'floodlight' | 'neonPink' | 'neonCyan' | 'billboardLamp' | 'lampPost' | 'stringLights' | 'cctv';

export interface LightSpec {
  /** Light color (lens and sign tubes take it too, after a rebuild). */
  color: string;
  /** Emitter position relative to its default spot on the lens, prop-local meters (x right, y up, z back toward the wall). */
  offset: [number, number, number];
  /** Aim, prop-local (front of the prop is -z); normalized when used. Floodlight heads turn with it. */
  dir: [number, number, number];
  /** Candela-like strength; scaled by ATMOS.practical. */
  intensity: number;
  /** Meters until the light is fully gone (falloff is ATMOS.lightDecay, faded to 0 at the range). */
  range: number;
  /** Cone half-angle in radians (1.5 is nearly a hemisphere), at most LIGHT_SPREAD_MAX. */
  spread: number;
  /** Softness of the cone edge, 0 = hard .. 1 = fades from the center. */
  softness: number;
  /** Glow sprite size at the lens, meters (0 = none). */
  glow: number;
  /** Glows show from every side (bare bulbs) instead of only from the side the lens faces. */
  glowAllAround: boolean;
  /** Visible beam length, meters (0 = none). */
  beam: number;
  /** Casts shadows: baked into its light (LIGHTMAP.shadows); with baking off, may take a spot shadow slot when near. */
  shadows: boolean;
}

/** Widest cone half-angle a light can have (radians): three.js spot lights need less than π/2. */
export const LIGHT_SPREAD_MAX = 1.55;

/** Per-kind light settings, live-tunable in the debug panel (Lights). */
export const LIGHTS: Record<LightKind, LightSpec> = {
  wallLamp: { color: '#9b96c0', offset: [0, 0, 0], dir: [0, -1, -0.25], intensity: 13.5, range: 10, spread: 1.33, softness: 1, glow: 0, glowAllAround: false, beam: 0.5, shadows: true },
  floodlight: { color: '#dfe8ff', offset: [0, 0, 0], dir: [0, -0.55, -0.83], intensity: 60, range: 40, spread: 0.55, softness: 0.4, glow: 0.6, glowAllAround: false, beam: 7, shadows: true },
  neonPink: { color: '#ff3fa4', offset: [0, 0, 0], dir: [1, 0, 0], intensity: 8, range: 10, spread: 1.45, softness: 1, glow: 0, glowAllAround: false, beam: 0, shadows: true },
  neonCyan: { color: '#2fe6ff', offset: [0, 0, 0], dir: [1, 0, 0], intensity: 8, range: 10, spread: 1.45, softness: 1, glow: 0, glowAllAround: false, beam: 0, shadows: true },
  lampPost: { color: '#ffcf8a', offset: [0, 0, 0], dir: [0, -1, 0], intensity: 30, range: 22, spread: 1.15, softness: 0.6, glow: 0.45, glowAllAround: false, beam: 4.5, shadows: true },
  stringLights: { color: '#ffd59a', offset: [0, 0, 0], dir: [0, -1, 0], intensity: 6, range: 10, spread: 1.45, softness: 1, glow: 0.22, glowAllAround: true, beam: 0, shadows: true },
  billboardLamp: { color: '#ffe2b0', offset: [0, 0, 0], dir: [0, -0.8, -0.6], intensity: 25, range: 12, spread: 0.8, softness: 0.5, glow: 0.3, glowAllAround: false, beam: 3.2, shadows: true },
  // On only while the camera follows the player (see CCTV); turns with the head. Glow and beam are not used.
  cctv: { color: '#dfe9ff', offset: [0, 0, 0], dir: [0, -0.3, -1], intensity: 6, range: 9, spread: 0.35, softness: 0.7, glow: 0, glowAllAround: false, beam: 0, shadows: false },
};

/**
 * Baked lamp light (render/bake): every steady lamp's light and shadows are
 * baked into light textures on the paintable surfaces (and into the vertices
 * of small decor), so any number of lamps costs the same per frame. Rebakes on
 * its own after build edits and light tweaks. Moving lights (CCTV) stay real
 * spot lights. Live-tunable in F3 -> Lights -> baked light.
 */
export const LIGHTMAP = {
  /** Off = the old way, for comparison: the nearest lamps get real spot lights (ATMOS.lightBudget). */
  enabled: true,
  /** Lamps cast shadows (each kind with LIGHTS[kind].shadows), from the level's colliders. */
  shadows: true,
  /** Light texels per meter on paintable surfaces (4 = 25 cm). Decor is lit per vertex. */
  texelsPerMeter: 4,
  /** Smooth (bilinear) light texels; off = hard pixels. */
  smooth: true,
  /** Wet highlights: the nearest lamps (0..4) also add a real-time specular highlight. */
  highlights: 4,
  /** Bake time per frame after edits and tweaks (ms). A freshly loaded level bakes at once. */
  budgetMs: 3,
};

/**
 * Build mode lighting: plain daylight so the level is easy to read. These keys
 * replace ATMOS while building; leaving build mode restores the night values.
 */
export const DAYLIGHT: Partial<typeof ATMOS> = {
  skyZenith: '#5f8fc4',
  skyHorizon: '#c7d3de',
  fogColor: '#bcc7d1',
  fogDensity: 0.003,
  cloudBase: 400,
  cloudColor: '#bcc7d1',
  ambientSky: '#e4ecf5',
  ambientGround: '#7a7d82',
  ambient: 1.7,
  moonColor: '#fff6e8',
  moon: 2.4,
  moonDir: [-0.45, 0.8, -0.3],
  practical: 0.4,
  windowGlow: 0,
  emissiveBoost: 0.8,
  paintGlow: 0,
  wetness: 0,
  rain: false,
};

/**
 * Volumetric light: a low-res raymarch through the fog after the scene pass.
 * Moonlight shafts use the moon shadow map, practical lights the real-light
 * pool (the two shadow slots also get shafts). Added in the final pass.
 */
export const VOLUMETRICS = {
  enabled: false,
  /** Raymarch resolution divisor relative to the render resolution (2 = half width and height). */
  downscale: 2,
  /** Samples along each ray (max 32). */
  steps: 16,
  /** Rays stop after this many meters. */
  maxDistance: 40,
  /** Scattering density of the air (1/m). */
  density: 0.035,
  /** Strength of moon shafts and of light-prop scattering. */
  moon: 0.06,
  lights: 0.5,
  /** Forward scattering (0 = even in all directions, 0.9 = only when looking toward the light). */
  anisotropy: 0.35,
};

/** Final color grading, applied in display space. Neutral = 0, 1, 1, 0, 0. */
export const GRADE = {
  /** Stops (+1 = twice as bright). */
  exposure: 0,
  contrast: 1.05,
  saturation: 0.95,
  /** Warm (+) / cool (-) white balance. */
  temperature: 0.25,
  /** Magenta (+) / green (-). */
  tint: 0,
};

export const PAINT = {
  /**
   * Texel density of every paint texture. The PAINT DETAIL setting (pause menu)
   * picks it from its choices in settings.ts: 24, 48, 72 or 96 (1 cm texels).
   */
  texelsPerMeter: 96,
  /** Alpha is quantized to this many steps in the shader for a chunky look (0 = off). */
  alphaSteps: 8,
  /** Hard cap on a single surface atlas side, in texels. */
  maxTextureSize: 2048,
  /**
   * Paint texture levels, the atlas included: each next one is half the size,
   * for surfaces seen from afar, so fine paint doesn't sparkle (1 = atlas only).
   * They add a third to the GPU memory of paint (the CPU keeps only the atlas).
   * Keep it small: a texel of level k averages 2^k x 2^k atlas texels.
   */
  mipLevels: 4,
};

/** Base textures (textures.ts) are pixel art at this density, whatever the paint detail: a 48 px panel spans one 2 m module. */
export const BASE_TEXTURES = { texelsPerMeter: 24 };

export interface CapSpec {
  name: string;
  /** Spread: half-angle of the spray cone (horizontal, on screen). */
  coneAngle: number;
  /** Particles per second at full flow. */
  rate: number;
  /** Opacity each particle adds where it lands (0..1). */
  strength: number;
  /** Radius of each particle's dot, in meters (the same at every paint detail; a dot smaller than a texel paints one texel). */
  stampRadius: number;
  /** Edge softness of each dot: 0 = hard edge, 1 = fades to nothing at the rim. */
  softness: number;
  /** Hiss loudness multiplier and tone (0 = bright, 1 = deep). */
  hissGain: number;
  hissTone: number;
  /** Crosshair circle diameter on screen, in CSS pixels. */
  crosshair: number;
  /** Color of the cap on the can model and pickups. */
  color: string;
}

export type CapId = 'skinny' | 'standard' | 'fat' | 'spray';
export const CAP_ORDER: CapId[] = ['skinny', 'standard', 'fat', 'spray'];
export const CAPS: Record<CapId, CapSpec> = {
  skinny: { name: 'SKINNY', coneAngle: 0.01, rate: 320, strength: 0.8, stampRadius: 0.033, softness: 0.15, hissGain: 0.5, hissTone: 0, crosshair: 8, color: '#7fb4f2' },
  standard: { name: 'STANDARD', coneAngle: 0.04, rate: 450, strength: 0.5, stampRadius: 0.046, softness: 0.35, hissGain: 0.75, hissTone: 0.4, crosshair: 14, color: '#f4f4f4' },
  fat: { name: 'FAT', coneAngle: 0.01, rate: 800, strength: 0.35, stampRadius: 0.1, softness: 0, hissGain: 1, hissTone: 1, crosshair: 22, color: '#f2a04c' },
  /** Wide, soft mist for fades and backgrounds: lots of faint, fuzzy dots. */
  spray: { name: 'SPRAY', coneAngle: 0.14, rate: 1100, strength: 0.12, stampRadius: 0.079, softness: 0.9, hissGain: 0.9, hissTone: 0.8, crosshair: 32, color: '#b98cf2' },
};

/** Paint colors, in Q/E cycling order. Black is always owned. Paint never runs out. */
export type PaintColor = 'black' | 'white' | 'red' | 'blue' | 'purple';
export const COLOR_ORDER: PaintColor[] = ['black', 'white', 'red', 'blue', 'purple'];
export const COLORS: Record<PaintColor, string> = { black: '#1d1d22', white: '#f1efe8', red: '#d42a2a', blue: '#2a6ee0', purple: '#8e3fd6' };

/** Can size is a permanent upgrade (sm -> md -> lg). Bigger cans lose pressure slower. */
export type CanSize = 'sm' | 'md' | 'lg';
export const SIZE_ORDER: CanSize[] = ['sm', 'md', 'lg'];
export const CAN_SIZES: Record<CanSize, { drain: number; scale: number }> = {
  sm: { drain: 1, scale: 0.85 },
  md: { drain: 0.6, scale: 1 },
  lg: { drain: 0.35, scale: 1.15 },
};

export const MARKER = {
  /** Max distance from the eye to the surface. */
  reach: 2.3,
  /** Line radius in meters (0 = one paint texel: the thinnest line, 4 cm on LOW paint detail, 1 cm on ULTRA). */
  radius: 0,
  strength: 0.95,
  /** First-person pose: distance in front of the eye, and model scale. */
  holdDistance: 0.38,
  holdScale: 1,
};

/** First-person hands + held tool: sway, bob and the trigger press. */
export const VIEWMODEL = {
  /** How far the hands lag behind mouse look (radians per pixel of mouse movement). */
  swayAmount: 0.0012,
  /** Max sway angle, radians. */
  swayMax: 0.08,
  /** How fast sway settles back (1/s). */
  swayReturn: 10,
  /** Walk bob: amplitude in meters at walking speed, and steps per meter. */
  bobAmount: 0.008,
  bobFrequency: 0.55,
  /** Hands dip while rising and lift while falling, per m/s of vertical speed. */
  fallLag: 0.003,
  /** How far the index finger pushes the nozzle down (radians of finger rotation at the knuckle). */
  pressCurl: 0.06,
  pressSpeed: 25,
  /** The hands' own lights (they're drawn in a separate pass): cold fill + warm rim. */
  fillSky: '#5a6a8c',
  fillGround: '#0d0f14',
  fill: 1.6,
  rimColor: '#ffd2a0',
  rim: 0.9,
};

/** Free left hand: reaches out and rests on a wall when you stand close to one. */
export const WALL_HAND = {
  /** Start touching a wall closer than this to your shoulder (m), let go beyond `release`. */
  reach: 1.1,
  release: 1.3,
  /** How fast the hand moves to the wall and back (1/s). */
  speed: 7,
  /** Where to look for a wall: degrees to the left of where you look, from (0 = straight ahead) to (90 = your left side). */
  fromAngle: 15,
  toAngle: 105,
  /** Hand height below the eyes (m). */
  drop: 0.3,
  /** Re-place the hand when the spot it should be on drifts this far from where it rests (m). */
  slide: 0.3,
  /** Palm on the wall: fingers lean inward this much (rad), and sit this far off the surface (m). */
  fingerLean: 0.3,
  gap: 0.004,
  /** Where the hand comes from and goes back to, out of view: position (camera space, m) and rotation (rad, x/y/z). */
  restOffset: [-0.32, -0.55, -0.2] as [number, number, number],
  restRotation: [-0.9, 0, 0.3] as [number, number, number],
  /** Wrist bend (rad, negative = back): on the way in / out, and with the palm on a wall. */
  restWristBend: -0.7,
  wallWristBend: -0.7,
};

/** Faint light around the player so dark corners stay walkable. Not a flashlight. */
export const PLAYER_LIGHT = {
  intensity: 0.5,
  /** Meters until it's gone. */
  range: 5,
  color: '#c0cfe8',
  /** Height above the eyes (m): from above it reads as ambient, not as a beam. */
  height: 0.35,
};

/**
 * Paint runs: spraying a lot onto paint that is already opaque builds up excess,
 * and on vertical faces enough excess starts a thin run down the wall.
 * All baked into the paint texture: no extra objects.
 */
export const DRIPS = {
  enabled: false,
  /** Excess paint (in full coats) a texel needs before it may run. */
  excess: 2.5,
  /** Runs started per square meter of paint that reaches the limit (spread over its texels, so every paint detail runs alike). */
  perSquareMeter: 17,
  /** Runs moving at the same time, level-wide. */
  maxActive: 40,
  /** Run length range (m). */
  minLength: 0.06,
  maxLength: 0.3,
  /** Starting speed (m/s); runs slow down as they go. */
  speed: 0.12,
  /** Opacity the run leaves behind (0..1). */
  strength: 0.85,
};

export const PICKUP = {
  /** Horizontal pickup radius around the player. */
  radius: 0.9,
  hover: 0.75,
  spin: 1.4,
  bob: 0.08,
};

export const SPRAY = {
  /** Max distance paint can travel. */
  range: 4.6,
  /** Paint strength fades linearly from this distance to `range`. */
  falloffStart: 1.5,
  particleSpeed: 11,
  particleSize: 0.035,
  maxParticles: 3000,
};

export const PRESSURE = {
  /** Pressure lost per second of spraying with a small can (1 = full); scaled by CAN_SIZES.drain. */
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
  sprintSpeed: 7,
  /** How fast you reach the wished speed (1/s). */
  acceleration: 8.5,
  /** How fast you stop on the ground with no input (1/s). */
  friction: 16,
  /** Fraction of `acceleration` available in the air. */
  airControl: 0.1,
  /** Crouching: collider height, eye height, speed. */
  crouchHeight: 1.1,
  crouchEyeHeight: 0.88,
  crouchSpeed: 2,
  /** How fast the eye moves between standing and crouched heights (1/s). */
  crouchTransition: 14,
  /** How fast the camera catches up after a step up/down (1/s). Higher = snappier. */
  stepSmoothing: 14,
  jumpHeight: 1.1,
  gravity: 19,
  stepHeight: 0.42,
  /** Ladders (Minecraft-style): push into the ladder to climb, let go to slide down, crouch to hold. */
  climbSpeed: 2.6,
  /** Push-off speed away from the ladder when jumping off it (it won't grab you again until you land or leave it). */
  ladderJumpOff: 3.5,
  mouseSensitivity: 0.0022,
  /** Falling below this height respawns the player. */
  killY: -25,
  /** Meters walked per footstep sound, and the landing speed (m/s) above which a landing sounds hard. */
  footstepStride: 1.7,
  hardLanding: 6,
};

/** Background city windows (F3 → Rendering → Skyline). */
export const SKYLINE = {
  /** Meters covered by one window texture repeat (8 x 8 windows): bigger = bigger windows. */
  windowScale: 32,
  /** Fraction of windows that are lit. */
  lit: 0.22,
  /** 0 = whole floors lit or dark together (regular), 1 = every window on its own (random). */
  randomness: 0.6,
  /** Variation in window brightness (0 = all equal). */
  brightnessVariation: 0.4,
  /** Change to get a different pattern. */
  seed: 1,
};

/** All gains are live (F3 → Sound). */
export const AUDIO = {
  masterGain: 0.7,
  hissGain: 0.22,
  /** Distant city rumble. */
  ambienceGain: 0.145,
  footstepGain: 0.25,
  /** Far-off police / fire sirens (see SIRENS). */
  sirenGain: 0.12,
  /** Rain bed at full density; scales with ATMOS.rainDensity, silent without rain. */
  rainGain: 0.045,
  /** Brightness of the rain hiss (lowpass Hz). */
  rainTone: 3200,
  thunderGain: 0.47,
  /** AC fan hum at the fan; fades out over `fanRange` meters. */
  fanGain: 0.135,
  fanRange: 7,
  uiGain: 1,
  /** Raindrops pinging on metal tops open to the sky: loudness, pings per second per piece, hearing range (m). */
  metalGain: 0.07,
  metalRate: 2.5,
  metalRange: 6,
};

/** Lightning + thunder, only while it rains. */
export const THUNDER = {
  enabled: true,
  /** Seconds between strikes (random in this range). */
  minInterval: 45,
  maxInterval: 150,
  /** Extra ambient / moon intensity at the peak of a flash. */
  flashAmbient: 5,
  flashMoon: 6,
  /** Sky brightening at the peak (0..1). */
  flashSky: 0.5,
  /** Delay from flash to thunder, seconds (random in this range: farther strikes are later and softer). */
  minDelay: 0.5,
  maxDelay: 3,
};

/** Smoke / warm air from vents, exhausts and AC units: one GPU-animated particle batch. */
export const SMOKE = {
  enabled: false,
  /** Particles per emitter (0..48). */
  perEmitter: 20,
  /** Seconds a puff lives. */
  life: 6.9,
  /** Rise over a life (m), and how far wind carries it (multiplies ATMOS.wind). */
  rise: 0.4,
  drift: 0.5,
  /** Puff size at birth and at the end (m). */
  startSize: 0.02,
  endSize: 2.1,
  opacity: 0.05,
  color: '#9aa3ad',
  /** How lit the smoke looks: base + ambient x ATMOS.ambient + flash x lightning flash. */
  lightBase: 0.25,
  lightAmbient: 0.12,
  lightFlash: 1.5,
};

/** AC fans: revolutions per second. */
export const FANS = {
  speed: 3,
};

/** Gentle flicker of neon tubes (light + tubes in sync). */
export const FLICKER = {
  /** Random steps per second. */
  speed: 12,
  /** Fraction of steps that dip, and how deep (0..1). */
  neonRate: 0.035,
  neonDepth: 0.55,
  /** Fast hum on top, as a fraction of brightness. */
  neonHum: 0.04,
};

/** Build mode (B). */
export const BUILD = {
  /** How far the crosshair reaches when aiming at faces (m). */
  reach: 120,
  /** Holding LMB keeps placing: first repeat after this delay, then every interval (s). */
  repeatDelay: 0.3,
  repeatInterval: 0.15,
  /** Free-fly speed while building (m/s), and with Shift held. */
  flySpeed: 7,
  flySprintSpeed: 16,
};

/** Far-off sirens now and then, for the city vibe (night only). Loudness is AUDIO.sirenGain. */
export const SIRENS = {
  enabled: true,
  /** Seconds between sirens (random in this range). */
  minInterval: 50,
  maxInterval: 150,
};

/** CCTV cameras follow the player when they come near, and switch on their light (LIGHTS.cctv). */
export const CCTV = {
  /** Start turning toward the player within this distance (m)... */
  followRange: 9,
  /** ...and follow fully within this one. */
  lockRange: 4,
  /** How far the head can turn from straight out (rad); beyond it the player is behind the wall. */
  maxTurn: 1.3,
};
