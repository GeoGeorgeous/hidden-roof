// All tunable constants live here. Units: meters, seconds, radians unless noted.

export const RENDER = {
  /** Internal resolution divisor. 2 = render at half res and upscale with nearest filtering. */
  pixelScale: 1,
  fov: 80,
  /** Extra FOV (degrees) while sprinting, eased in and out. */
  sprintFovBoost: 6,
  sprintFovEase: 8,
  /** Frame rate limit (frames per second); 0 = none, as fast as the display refreshes. A player setting (FRAME RATE). */
  maxFps: 0,
  /** Go fullscreen when the game takes the mouse (off: play in the browser window). */
  fullscreen: true,
  /** Moving prop parts: CCTV heads pan and follow, AC fans spin. Off: they stay at rest. */
  propMotion: true,
  /**
   * Decor and shadow batches are merged per tile of this many meters (x, z):
   * smaller = cheaper edits and finer culling, but more draw calls. Read when
   * the level changes.
   */
  batchTile: 32,
};

/** Rainy night. Colors are hex; everything else is live-tunable in the debug panel. */
export const ATMOS = {
  /** How fast the drawing fades into paper with distance (1/m). */
  fogDensity: 0.003,
  /** Low clouds: everything above this height (relative to the level) fades into them. */
  cloudBase: 45,
  cloudFade: 50,
  ambientSky: '#8a8f99',
  ambientGround: '#000000',
  ambient: 1.1,
  moonColor: '#e6e4dc',
  moon: 0.45,
  /** Toward the moon (degrees): height above the horizon, and heading round from +z toward +x. Sets the shadows' direction. */
  moonHeight: 41.2,
  moonHeading: 227.7,
  shadows: true,
  /** Real spot lights may cast shadow-map shadows (2 slots, kinds with `shadows`). Only while lamps aren't baked (LIGHTMAP.enabled off). */
  spotShadows: false,
  /** Half-size of the moon shadow area around the player, in meters. */
  shadowRange: 32,
  /** Moon shadow map size (px per side): sharper shadows over the same range, more GPU memory and fill. */
  shadowDetail: 2048,
  /** Multiplier for all light props. */
  practical: 2,
  /** While lamps aren't baked (LIGHTMAP.enabled off): real lights handed to the nearest light props (others use glow tricks only). */
  lightBudget: 8,
  /** Distance falloff exponent of light props: 2 = physical inverse square, lower reaches further. */
  lightDecay: 2,
  /** Brightness of emissive surfaces (lamps, neon). */
  emissiveBoost: 1.8,
  /** Wet look on up-facing surfaces: darker + specular. */
  wetness: 0.15,
  rain: false,
  /** Fraction of the maximum drop count. */
  rainDensity: 0.09,
  rainSpeed: 8,
  /** Raindrop color, and how visible the drops are (multiplier, 1 = default). */
  rainColor: '#26272c',
  rainOpacity: 1,
  /** Wind for rain and smoke: speed (m/s) and the heading it blows toward (degrees, 0 = +z, 90 = +x). */
  windStrength: 3.6,
  windHeading: 236.3,
};

/** Practical light kinds; every light prop uses one (see kit/lights.ts). */
export type LightKind = 'wallLamp' | 'floodlight' | 'neon' | 'billboardLamp' | 'lampPost' | 'stringLights' | 'cctv' | 'bulkhead' | 'lightPanel' | 'aviation';

export interface LightSpec {
  /** Light color (the lens takes it too, after a rebuild). Neon signs have one each instead (NEON_COLORS). */
  color: string;
  /** How much of `color` shows in the light on walls (INK.tint scales it): 0 = only its brightness (neutral), 1 = its full hue. Baked lamps only: with LIGHTMAP.enabled off the walls get no hue. */
  tint: number;
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

/** Line sources (LightPiece.span, the neon signs) are baked as this many lamps along their length, sharing the kind's intensity, so the light comes from the whole tube, not one point. */
export const NEON_LIGHT_ROWS = 4;

/** The neon signs' colors: each sign's tubes, text and light (the rest of its light is LIGHTS.neon). */
export type NeonColor = 'pink' | 'cyan' | 'amber';
export const NEON_COLORS: Record<NeonColor, string> = { pink: '#ff3fa4', cyan: '#2fe6ff', amber: '#ffa24a' };

/** Per-kind light settings, live-tunable in the debug panel (Render → Light props). */
export const LIGHTS: Record<Exclude<LightKind, 'neon'>, LightSpec> & { neon: Omit<LightSpec, 'color'> } = {
  wallLamp: { color: '#9b96c0', tint: 0, dir: [0, -1, -0.25], intensity: 13.5, range: 10, spread: 1.33, softness: 1, glow: 0, glowAllAround: false, beam: 0.5, shadows: true },
  floodlight: { color: '#dfe8ff', tint: 0, dir: [0, -0.55, -0.83], intensity: 60, range: 40, spread: 0.55, softness: 0.4, glow: 0.6, glowAllAround: false, beam: 7, shadows: true },
  neon: { tint: 1, dir: [1, 0, 0], intensity: 8, range: 10, spread: 1.45, softness: 1, glow: 0, glowAllAround: false, beam: 0, shadows: true },
  lampPost: { color: '#ffcf8a', tint: 0, dir: [0, -1, 0], intensity: 30, range: 22, spread: 1.15, softness: 0.6, glow: 0.45, glowAllAround: false, beam: 4.5, shadows: true },
  stringLights: { color: '#ffd59a', tint: 0, dir: [0, -1, 0], intensity: 6, range: 10, spread: 1.45, softness: 1, glow: 0.22, glowAllAround: true, beam: 0, shadows: true },
  billboardLamp: { color: '#ffe2b0', tint: 0, dir: [0, -0.8, -0.6], intensity: 25, range: 12, spread: 0.8, softness: 0.5, glow: 0.3, glowAllAround: false, beam: 3.2, shadows: true },
  // On only while the camera follows the player (see CCTV); turns with the head. Glow and beam are not used.
  cctv: { color: '#dfe9ff', tint: 0, dir: [0, -0.3, -1], intensity: 6, range: 9, spread: 0.35, softness: 0.7, glow: 0, glowAllAround: false, beam: 0, shadows: false },
  // Roof lights (kit/roof-lights.ts): the caged lamp over a roof door, the flat wall panel.
  bulkhead: { color: '#e9e3d2', tint: 0, dir: [0, -0.7, -0.7], intensity: 9, range: 8, spread: 1.2, softness: 0.8, glow: 0.16, glowAllAround: false, beam: 0, shadows: true },
  lightPanel: { color: '#eef1ff', tint: 0, dir: [0, -0.25, -1], intensity: 11, range: 9, spread: 1.4, softness: 1, glow: 0.1, glowAllAround: false, beam: 0, shadows: true },
  // Aviation obstruction light: red, pulsing slowly (FLICKER.pulse*); its dome is the glow.
  aviation: { color: '#ff2a1a', tint: 1, dir: [0, 1, 0], intensity: 3, range: 5, spread: 1.5, softness: 1, glow: 0, glowAllAround: true, beam: 0, shadows: false },
};

/**
 * Baked lamp light (render/bake): every steady lamp's light and shadows are
 * baked into light textures on the paintable surfaces (and into the vertices
 * of small decor), so any number of lamps costs the same per frame. Rebakes on
 * its own after build edits and light tweaks. Moving lights (CCTV) stay real
 * spot lights. Live-tunable in F3 -> Render -> Light props -> baked light.
 */
export const LIGHTMAP = {
  /** Off = the old way, for comparison: the nearest lamps get real spot lights (ATMOS.lightBudget). */
  enabled: true,
  /** Lamps cast shadows (each kind with LIGHTS[kind].shadows), from the level's colliders. */
  shadows: true,
  /** Light texels per meter on paintable surfaces (4 = 25 cm). Decor is lit per vertex. */
  texelsPerMeter: 4,
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
  fogDensity: 0.003,
  cloudBase: 400,
  ambientSky: '#e4ecf5',
  ambientGround: '#7a7d82',
  ambient: 1.7,
  moonColor: '#fff6e8',
  moon: 2.4,
  moonHeight: 55.9,
  moonHeading: 236.3,
  practical: 0.4,
  emissiveBoost: 0.8,
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

/**
 * The ink look (render/ink): the world is drawn in ink on paper, and only the
 * player's paint keeps its color. Lit surfaces get a tone (light x material
 * gray), and the tone picks how much ink: paper, hatching, cross-hatching,
 * solid black. Edges get pen outlines in the final pass. Live in F3 -> Render -> Shaders.
 */
export const INK = {
  paper: '#dfe0d6',
  ink: '#3a3749',
  sky: '#0c0b0f',
  /** What the city fades into above the cloud base (ATMOS.cloudBase). */
  cloud: '#201f29',
  /** Light multiplier before the tone steps (brighter = more paper). */
  exposure: 2.1,
  /** Tone steps (0..1): above `paper` no ink; below `hatch` cross-hatching; below `black` solid ink. */
  paperTone: 0.67,
  hatchTone: 0.27,
  blackTone: 0.19,
  /** Hatch line spacing on screen (px) at any distance, line thickness (fraction of the spacing), and how dark a line is (1 = full ink). */
  hatchPx: 2,
  hatchWidth: 0.5,
  hatchOpacity: 1,
  /** Ragged tone edges: how far the noise shifts the steps (tone units). */
  toneNoise: 0.05,
  /** Meters below which the city sinks into black (the street far down), and where it is fully black. */
  voidTop: -15,
  voidBottom: -97,
  /** Paint stays colored: its shading is light x this, never below `paintMin`. Hatching over paint in the dark. */
  paintLight: 1.4,
  paintMin: 0.4,
  paintHatch: 0.3,
  /** Pen outlines from the depth buffer: strength, crease sensitivity, and distance over which they thin out (m). */
  outline: 0.95,
  crease: 1,
  outlineFade: 730,
  /** Paper grain strength. */
  grain: 0.3,
  /** Colored light on walls and floors: how strongly the lamp kinds with LIGHTS[kind].tint tint what they light (0 = none, the pure ink look). Comes from the baked light, so only while LIGHTMAP.enabled is on. */
  tint: 0.35,
  /** Grime on surfaces: rain streaks, stains, buffed patches, cracks, seams (0 = clean). */
  grime: 0.25,
};

/** Shape of the colored light tint (INK.tint) in the ink shader; built into the shader, not live. */
export const INK_TINT = {
  /** The tint is the light's hue relative to its brightness, which grows without bound in the dark: brightness counts as at least this. */
  minLight: 0.15,
  /** Largest change of a color channel, ± this fraction. */
  max: 0.8,
  /** Neon text takes this many times more of its lamp's hue than the walls it lights. */
  neonBoost: 2,
  /** The same floor as minLight for the neon text's own color (its tint's brightness). */
  neonMinLight: 0.02,
};

/** The finished image's brightness, in the final pass (render/ink/compose.ts). */
export const GRADE = {
  /** Stops (+1 = twice as bright): paper and lines alike; INK.exposure decides how much ink. */
  exposure: 0,
};

/** The dark edge of the screen: a gradient over the view (hud.ts), live in F3. */
export const VIGNETTE = {
  enabled: true,
  /** Darkness at the corners, 0..1 (0 = none). */
  strength: 0.3,
  /** Where it starts, as a percentage of the way out to the corners. */
  start: 60,
  color: '#141416',
};

/** The pause menu (ESC): the sheet over the game and what it shows, live in F3 → UI. */
export const PAUSE_MENU = {
  /** Sheet color and opacity; lighter while the F3 panel is open, so the game shows behind it. */
  color: '#0e0e10',
  opacity: 0.8,
  debugOpacity: 0.45,
  /** The list of keys under the menu. */
  controls: true,
};

/** What the HUD shows (hud.ts) and the hotbar's size (inventory/hotbar.ts), live in F3 → UI. */
export const HUD = {
  /** Body-cam corner brackets. */
  frame: true,
  /** REC dot and elapsed time, top left. */
  rec: true,
  /** Camera label under it (CAM 01 · ROOFTOP). */
  cam: true,
  /** Date and time, top right. */
  clock: true,
  /** Performance readout, bottom left: fps, draw calls, triangles, texture memory. */
  perf: true,
  /** GPU time per frame in it too (timer queries: desktop Chromium; a few queries a frame while shown). */
  perfGpu: false,
  /** How long the cap and color tags show after a change, the PSI gauge after the pressure last changed, and a hotbar message (s). */
  tagTime: 2.5,
  gaugeTime: 1.2,
  toastTime: 2.2,
  /** Hotbar slots: size and the gap between them (CSS px), roundness (0 = square, 1 = circle), icon size (share of the slot). */
  slotSize: 30,
  slotGap: 10,
  slotRoundness: 1,
  iconSize: 0.73,
  /** Slot border and background (the background at `slotFillOpacity`, 0 = none). */
  slotBorder: '#141416',
  slotFill: '#ebe5d6',
  slotFillOpacity: 0,
  /** The selected slot's border and background. */
  selectedBorder: '#141416',
  selectedFill: '#ebe5d6',
  selectedFillOpacity: 0.35,
};

/** Slogans on lettered sign panels (kit/lettering.ts panelLettering). */
export const SIGN_TEXT = {
  /** A panel takes the slogans whose characters stay at least this wide (m) across its width. */
  minCharWidth: 0.28,
};

export const PAINT = {
  /**
   * Texel density of every paint texture. The PAINT DETAIL setting (pause menu)
   * picks it from its choices in settings.ts: 24, 48, 72 or 96 (1 cm texels).
   */
  texelsPerMeter: 96,
  /**
   * A box piece of a prop takes paint when one of its faces is at least this
   * wide (m) and this big (m²): frames, posts and plates do, bolts and lamp
   * heads don't. Emissive and chain-link pieces never do.
   */
  minFaceSide: 0.06,
  minFaceArea: 0.12,
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
  /**
   * Changed texels are uploaded in up to this many rects per surface each frame,
   * merged where they touch: two strokes on faces far apart in one atlas upload
   * apart, not as the rect spanning both. Past the limit a new rect joins the one
   * it grows least.
   */
  dirtyRects: 8,
};

/** Base textures (textures.ts) are pixel art at this density, whatever the paint detail: a 48 px panel spans one 2 m module. */
export const BASE_TEXTURES = { texelsPerMeter: 24 };

export interface CapSpec {
  name: string;
  /** Spread: the spray cone's full angle (radians, horizontal on screen). */
  spread: number;
  /** Particles per second at full flow. */
  rate: number;
  /** Opacity each particle adds where it lands (0..1). */
  strength: number;
  /** Width of each particle's dot, in meters (the same at every paint detail; a dot smaller than a texel paints one texel). */
  dotSize: number;
  /** Edge softness of each dot: 0 = hard edge, 1 = fades to nothing at the rim. */
  softness: number;
  /** Hiss loudness multiplier and tone (0 = bright, 1 = deep). */
  hissGain: number;
  hissTone: number;
  /** Crosshair circle diameter on screen, in CSS pixels. */
  crosshair: number;
  /** Paint runs (with DRIPS on), per m² of paint reaching DRIPS.excess. */
  drips: number;
  /** Pressure lost per second of spraying with this cap (1 = a full can). */
  drain: number;
  /** Color of the cap on the can, its pickup and hotbar icon. */
  color: string;
  /** Width of the cap's nozzle (m): it hints at the cap. */
  nozzle: number;
}

export type CapId = 'skinny' | 'standard' | 'fat' | 'spray';
export const CAP_ORDER: CapId[] = ['skinny', 'standard', 'fat', 'spray'];
export const CAPS: Record<CapId, CapSpec> = {
  skinny: { name: 'SKINNY', spread: 0.02, rate: 320, strength: 0.8, dotSize: 0.066, softness: 0.15, hissGain: 0.5, hissTone: 0, crosshair: 8, drips: 17, drain: 0.04, color: '#7fb4f2', nozzle: 0.004 },
  standard: { name: 'STANDARD', spread: 0.08, rate: 450, strength: 0.5, dotSize: 0.092, softness: 0.35, hissGain: 0.75, hissTone: 0.4, crosshair: 14, drips: 17, drain: 0.04, color: '#f4f4f4', nozzle: 0.006 },
  fat: { name: 'FAT', spread: 0.02, rate: 800, strength: 0.35, dotSize: 0.2, softness: 0, hissGain: 1, hissTone: 1, crosshair: 22, drips: 17, drain: 0.04, color: '#f2a04c', nozzle: 0.01 },
  /** Wide, soft mist for fades and backgrounds: lots of faint, fuzzy dots. */
  spray: { name: 'SPRAY', spread: 0.28, rate: 1100, strength: 0.12, dotSize: 0.158, softness: 0.9, hissGain: 0.9, hissTone: 0.8, crosshair: 32, drips: 17, drain: 0.04, color: '#b98cf2', nozzle: 0.013 },
};

/** Paint colors, in Q/E cycling order. Black is always owned. Paint never runs out. */
export type PaintColor = 'black' | 'white' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
export const COLOR_ORDER: PaintColor[] = ['black', 'white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
export const COLORS: Record<PaintColor, string> = {
  black: '#1d1d22',
  white: '#f1efe8',
  red: '#d42a2a',
  orange: '#f26a1b',
  yellow: '#f5cf1d',
  green: '#2fb34a',
  blue: '#2a6ee0',
  purple: '#8e3fd6',
  pink: '#f0479a',
};

export const MARKER = {
  /** Max distance from the eye to the surface. */
  reach: 2.3,
  /** Starting width of the square nib, in meters (0 = one paint texel: the thinnest line, 4 cm on LOW paint detail, 1 cm on ULTRA). Each player's own is Inventory.size. */
  width: 0.024,
  /** Mouse wheel with the marker in hand: changes the player's nib width by widthStep, within widthMin..widthMax (m). */
  widthMin: 0,
  widthMax: 0.1,
  widthStep: 0.008,
  /** Crosshair with the marker in hand (px): `crosshair` plus `crosshairPerMeter` x the nib width, so it follows the wheel. */
  crosshair: 4,
  crosshairPerMeter: 200,
  /**
   * Paint runs (with DRIPS on) from the marker, per m² of paint reaching DRIPS.excess:
   * a nib covers little area but pumps a lot of paint into it.
   */
  drips: 136,
  strength: 0.95,
  /** Held still, the nib stamps the same spot every frame: let it add to runs this often (per s), whatever the frame rate. */
  stillRate: 30,
  /** Moves are filled with stamps at most `spacing` x the nib width apart (at least half a texel), at most maxRays per frame, so they leave no gaps. */
  spacing: 0.3,
  maxRays: 32,
};

/** Crosshair (px) with no sized tool in hand: the stepladder, empty hands, build mode. The others set their own. */
export const CROSSHAIR = { plain: 6 };

/** Hotbar circles shown from the start (empty until their tool is found); at least one per tool. */
export const HOTBAR = { slots: 5 };

/** Paint roller (slot 4): a wide graffiti roller on a short pole, rolling solid bands of paint. */
export const ROLLER = {
  /** Max distance from the eye to the surface (it's on a short pole). */
  reach: 2.6,
  /** Starting width of the stroke: the roller head's length (m). Each player's own is Inventory.size. */
  width: 0.44,
  /** Mouse wheel with the roller in hand: changes the player's roller width by widthStep, within widthMin..widthMax (m). */
  widthMin: 0.2,
  widthMax: 0.8,
  widthStep: 0.06,
  /** Length of each press along the stroke (m); presses overlap as you roll. */
  pressLength: 0.06,
  /** Fraction of each end of the roller that leaves lighter paint. */
  softness: 0.15,
  /** Crosshair with the roller in hand (px): `crosshair` plus `crosshairPerMeter` x the width (0: the same at every width). */
  crosshair: 10,
  crosshairPerMeter: 0,
  /** Opacity per press: a roller lays it on thick. */
  strength: 0.85,
  /** Paint runs (with DRIPS on), per m² of paint reaching DRIPS.excess: a loaded roller runs easily. */
  drips: 34,
  /** Held still, presses add to runs this often (per s), whatever the frame rate. */
  stillRate: 20,
  /** Moves are filled with presses at most `spacing` x the press length apart at full reach, at most maxRays per frame. */
  spacing: 0.5,
  maxRays: 48,
};

/** Sponge (slot 5): scrubs paint off surfaces. Held pose is HOLD.sponge. */
export const SPONGE = {
  /** Max distance from the eye to the surface: arm's length. */
  reach: 1.6,
  /** Starting width of the round patch it cleans per stroke step (m). Each player's own is Inventory.size. */
  width: 0.18,
  /** Share of the paint left that each pass takes off (0..1): scrub back and forth to clean. */
  strength: 0.24,
  /** 0 = cleans the whole patch evenly .. 1 = only the middle, fading to the rim. */
  softness: 0.5,
  /** Mouse wheel with the sponge in hand: changes the player's patch width by widthStep, within widthMin..widthMax (m). */
  widthMin: 0.04,
  widthMax: 0.6,
  widthStep: 0.04,
  /** Crosshair with the sponge in hand (px): `crosshair` plus `crosshairPerMeter` x the patch width, so it follows the wheel. */
  crosshair: 6,
  crosshairPerMeter: 100,
  /** How far it scrubs in small circles while cleaning (m), and how fast (turns per s). */
  scrubSize: 0.012,
  scrubSpeed: 5,
  /** Held still, it keeps scrubbing the same spot this often (per s), whatever the frame rate. */
  stillRate: 20,
  /** Moves are filled with steps at most `spacing` x the patch width apart at full reach, at most maxRays per frame. */
  spacing: 0.25,
  maxRays: 24,
  /** Height of the sponge in the hand's frame (m): up where the can's grip is, so the arm matches the can's. */
  gripHeight: 0.0,
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
  /** The most the hands dip or lift (m): past it a stronger fallLag changes nothing. */
  fallLagMax: 0.03,
  /** How far the index finger pushes the nozzle down (radians of finger rotation at the knuckle). */
  pressCurl: 0.06,
  pressSpeed: 25,
  /** The hands' own lights (they're drawn in a separate pass): fill + rim; they set the hands' ink tones. */
  fillSky: '#a0a0a0',
  fillGround: '#0d0f14',
  fill: 1.6,
  rimColor: '#ffffff',
  rim: 0.9,
};

/**
 * How each tool is held in first person (F3 -> Camera -> HELD CAN, HELD MARKER, ...):
 * `distance` in front of the eye (m); `x` right and `y` up per meter of
 * distance, so changing the distance keeps the tool in the same spot on
 * screen; `scale` of the model and hand; `pitch`, `yaw`, `roll` (radians).
 * Animations (shake, recoil, drawing) add to this pose.
 */
export interface HoldPose {
  distance: number;
  x: number;
  y: number;
  scale: number;
  pitch: number;
  yaw: number;
  roll: number;
}
export const HOLD: Record<'can' | 'marker' | 'ladder' | 'roller' | 'sponge', HoldPose> = {
  can: { distance: 0.5, x: 0.4, y: -0.44, scale: 1, pitch: -0.12, yaw: 0.25, roll: 0.08 },
  marker: { distance: 0.38, x: 0.421, y: -0.447, scale: 1, pitch: -1.1, yaw: 0.3, roll: 0.25 },
  ladder: { distance: 0.5, x: 0.48, y: -0.54, scale: 1, pitch: 0.15, yaw: -0.75, roll: 0.18 },
  roller: { distance: 0.6, x: 0.42, y: -0.12, scale: 0.75, pitch: -1.0, yaw: 0.25, roll: -0.15 },
  sponge: { distance: 0.5, x: 0.4, y: -0.44, scale: 1, pitch: -0.12, yaw: 0.25, roll: 0.08 },
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
  enabled: true,
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
  /** Excess paint (in full coats) a texel needs before it may run. How often it then runs is each cap's and tool's `drips` (per m², spread over its texels, so every paint detail runs alike). */
  excess: 2.5,
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

type V3 = [number, number, number];
/** A pickup's pose on top of its model: size multiplier, offset (m) and rotation (radians). */
const pickupPose = (size = 1) => ({ size, offset: [0, 0, 0] as V3, rotation: [0, 0, 0] as V3 });

export const PICKUP = {
  /** Walk within this distance of a pickup to collect it (m), with your feet within reachHeight above or below it. */
  reach: 0.9,
  reachHeight: 1.2,
  hover: 0.75,
  spin: 1.4,
  bob: 0.08,
  /** The drawn ring around every pickup: size (x the item's hover box) and opacity. */
  ring: { size: 1.3, opacity: 0.7 },
  /**
   * Each kind's world pickup, on top of its tool model (MODELS, shown at twice real
   * size): not its hotbar icon or the avatar's tool. Color unlocks are `can`s.
   */
  models: {
    can: pickupPose(),
    cap: pickupPose(4.4),
    marker: pickupPose(),
    ladder: pickupPose(0.9),
    roller: pickupPose(0.6),
    sponge: pickupPose(1.6),
  },
};

/**
 * Tool models (m), at real size: one shape per tool (tools/shapes.ts), shared by
 * the first-person view, the pickups, the figure's hand and the hotbar icons.
 * Each cap's color and nozzle are in CAPS.
 */
export const MODELS = {
  can: { width: 0.066, height: 0.1445, labelHeight: 0.0765 },
  /** The cap on a can and the cap pickup. */
  cap: { width: 0.018, height: 0.014 },
  marker: { width: 0.022, length: 0.13, bandLength: 0.03, nibSize: 0.009 },
  /** The cover's length is the player's roller width. */
  roller: { coverThickness: 0.08, frameThickness: 0.008, poleLength: 0.2 },
  /** The stepladder folded, as carried (the placed one is kit/access.ts). */
  ladder: { height: 0.36, width: 0.09, treadSpacing: 0.1 },
  /** A kitchen sponge: a soft block with a darker scouring pad on its front (the side that goes on the wall), pores on the soft part. */
  sponge: { width: 0.14, height: 0.09, depth: 0.05, padThickness: 0.014, pores: 14, poreSize: 0.006 },
};

export const SPRAY = {
  /** Max distance from the eye to the surface: how far paint travels. */
  reach: 4.6,
  /** Paint strength fades linearly from this distance to `reach`. */
  falloffStart: 1.5,
  particleSpeed: 11,
  particleSize: 0.035,
  maxParticles: 3000,
};

export const PRESSURE = {
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
  /** Crouch key toggles crouching instead of holding it. */
  crouchToggle: false,
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

/** F3 -> Avatar: the test figure (dev/avatar-preview.ts). */
export const AVATAR_TEST = {
  /** The pose shown (an index into its list; F3 shows its name). */
  pose: 0,
  /** Slow motion: 1 is real time. */
  timeScale: 1,
  /** Look pitch added to the pose's (rad, up is positive): sweeps an aimed arm. */
  pitch: 0,
  /** Moving poses at this speed (m/s; 0: the pose's own), around a loop on the floor, or on the spot. */
  speed: 0,
  onTheSpot: false,
  /** The loop's width across (m). */
  loopSize: 3.2,
};

/** Multiplayer: player snapshots and how a remote player is shown from them (src/net). */
export const NET = {
  /** Snapshots sent per second. */
  sendRate: 20,
  /**
   * A remote player is shown at least this far behind their newest snapshot
   * (s): two snapshots and some jitter, so there's always one to move toward.
   * On a jittery link it grows to a snapshot interval plus `jitterCover` times
   * the measured jitter, up to `maxDelay`.
   */
  interpDelay: 0.13,
  jitterCover: 3,
  maxDelay: 0.45,
  /** With no newer snapshot, keep moving the way it went for at most this long (s), then stand (Source uses 0.25). */
  extrapolate: 0.25,
  /** How much faster or slower a remote player's time may run while it catches up with a better clock estimate or delay (0.1 = 10%). */
  clockRate: 0.1,
  /** A jump in where they're shown (a late snapshot correcting a guess) is smoothed out at this rate (1/s); one longer than `teleport` (m) is not. */
  smoothing: 12,
  teleport: 2,
};

/** F3 -> Ghost (src/dev/ghost.ts): the network it plays through, and how far behind it follows you. */
export const GHOST = {
  /** One-way delay (s), random extra delay up to (s), and the share of packets held up by a hiccup (a lost packet resent: TCP holds everything behind it). */
  latency: 0.08,
  jitter: 0.04,
  hiccups: 0,
  /** How long a hiccup holds up a packet and everything after it (s), as a resend over a reliable link would. */
  hiccupDelay: 0.3,
  followDelay: 2,
};

/**
 * The player figure others see (src/avatar, docs/avatar.md). Joint heights
 * above the feet and lengths in meters, at rest: standing, arms down. Its
 * eyes are at PLAYER.eyeHeight and the top of its head at PLAYER.height.
 */
export const AVATAR = {
  ankle: 0.09,
  hip: 0.92,
  /** Hip joints are this far either side of the middle. */
  hipSide: 0.1,
  waist: 1.06,
  chest: 1.26,
  neck: 1.47,
  shoulder: 1.43,
  shoulderSide: 0.21,
  upperArm: 0.29,
  forearm: 0.26,
  /** Wrist to the knuckles, and each finger's two segments. */
  palm: 0.085,
  finger: [0.045, 0.04] as [number, number],
  /** Head (an egg): width, height, depth. */
  head: [0.19, 0.25, 0.215] as [number, number, number],
  hoodUp: false,
  /** Gray tones (the ink draws them): the only color on the figure is paint. */
  colors: {
    hoodie: '#3c3f44',
    trim: '#2c2e33',
    pocket: '#4a4d53',
    pants: '#3c3f44',
    shoe: '#26282c',
    sole: '#c6c8ca',
    head: '#b4b7bb',
    eyes: '#16181c',
    glove: '#a4a6aa',
  },
  /** Walking: meters per step at walking speed and per extra m/s, foot lift (m). */
  step: 0.62,
  stepPerSpeed: 0.07,
  stepLift: 0.13,
  /** Crouching: how far the hips drop (m) and the body leans forward (rad). */
  crouchDrop: 0.46,
  crouchLean: 0.55,
  /** Crouched and spraying, the body leans this far back instead (rad, negative is back). */
  crouchSprayLean: -0.25,
  /** Leaning forward when sprinting (rad). */
  sprintLean: 0.22,
  /** How fast poses blend into each other (1/s). */
  blend: 10,
};

/**
 * The city around the level (src/city): seeded, so it's the same on every
 * load. A level file can override any of these in its own `skyline` object
 * (e.g. another seed, a wider margin). F3 -> World -> City rebuilds it.
 */
export const SKYLINE = {
  seed: 23,
  /** City radius around the level (m). */
  radius: 650,
  /** Towers rise toward the city's edge, reaching full height this far out (m): by distance, not radius, so a smaller city is the middle of a bigger one. */
  riseTo: 650,
  /** City block pitch (m) and street width range (m). */
  block: 46,
  streetMin: 8,
  streetMax: 15,
  /** Free space kept around the level (m). */
  margin: 8,
  /** Street height (m): far below the rooftops. */
  street: -90,
  /** Within this distance (m): low roofs to look down on, mixed with huge towers. */
  near: 210,
  /** Share of near lots that are huge towers, and their top height range (m). */
  tallChance: 0.24,
  tallMin: 30,
  tallMax: 120,
  /** Rooftop clutter (tanks, frames, masts, railings) within this distance (m). */
  clutterRange: 280,
  /** Multiplier for how far thin lines (lattices, railings, wires) stay visible. Live. */
  lineRange: 1,
  /** Fraction of punched facade windows that are lit (drawn as paper). Live. */
  litWindows: 0.08,
  /** How much the city shows (1 = fully, 0 = gone into the sky color), to focus on the level. Live. */
  opacity: 0.75,
};

/** All gains are live (F3 → Sound). */
export const AUDIO = {
  masterGain: 0.7,
  hissGain: 0.22,
  /** Distant city rumble. */
  ambienceGain: 0.145,
  footstepGain: 0.25,
  /** Rain bed at full density; scales with ATMOS.rainDensity, silent without rain. */
  rainGain: 0.045,
  /** Brightness of the rain hiss (lowpass Hz). */
  rainTone: 3200,
  thunderGain: 0.47,
  /** AC fan hum at the fan; fades out over `fanRange` meters. */
  fanGain: 0.135,
  fanRange: 7,
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
  enabled: true,
  /** Particles per emitter (0..48). */
  perEmitter: 20,
  /** Seconds a puff lives. */
  life: 6.9,
  /** Rise over a life (m), and how far wind carries it (multiplies the wind, ATMOS.windStrength). */
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

/** Gentle flicker of neon tubes (light + tubes in sync), and the slow pulse of aviation lights. */
export const FLICKER = {
  /** Random steps per second. */
  speed: 12,
  /** Fraction of steps that dip, and how deep (0..1). */
  neonRate: 0.035,
  neonDepth: 0.55,
  /** Fast hum on top, as a fraction of brightness. */
  neonHum: 0.04,
  /** Aviation lights: pulses per second, and how dark they get between pulses (0..1). */
  pulseRate: 0.5,
  pulseDepth: 0.85,
};

/** The player's stepladder (a pickup, slot 3; placed with LMB, one at a time). */
export const STEPLADDER_PLACE = {
  /** How far from the eye the crosshair can place it (m). */
  reach: 4.5,
  /** Its feet may sit this much above or below each other (m): any more and it would rock. */
  footTolerance: 0.04,
  /** The spot in front of it must be floor within this step of its base (m), so you can walk up and climb. */
  standStep: 0.45,
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
  /** The dark shade behind the picker, full height on the left edge (build/picker-view.ts): its color, its opacity at the edge and how far right it fades out (px). */
  shadeColor: '#0e0e10',
  shadeOpacity: 0.86,
  shadeWidth: 760,
  /** The light over a placed prop with settings (floodlight tilt, sign text) while the crosshair is on it (build/prop-settings.ts). */
  highlightColor: '#ffd23f',
  highlightOpacity: 0.35,
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
