import { SKYLINE, ATMOS, INK, AUDIO, CAP_ORDER, CAPS, CCTV, DAYLIGHT, DRIPS, FANS, FLICKER, GRADE, LIGHT_SPREAD_MAX, LIGHTMAP, LIGHTS, PICKUP, SIRENS, SMOKE, THUNDER, PLAYER_LIGHT, VOLUMETRICS, WALL_HAND, MARKER, PAINT, PLAYER, PRESSURE, RENDER, SPRAY, VIEWMODEL, HOLD } from '../config';

// Debug panel contents: collapsible sections of live sliders/toggles that write
// straight into the config objects, plus read-only stats. Each value knows its
// config path, so "copy" produces JSON that maps back onto config.ts.

type Obj = Record<string, unknown>;

export type Item =
  | { kind: 'range'; label: string; path: string[]; min: number; max: number; step: number; onChange?: () => void }
  | { kind: 'toggle'; label: string; path: string[]; onChange?: () => void }
  | { kind: 'color'; label: string; path: string[]; onChange?: () => void }
  | { kind: 'action'; label: string; run: () => void }
  | { kind: 'readout'; label: string; get: () => string }
  | { kind: 'heading'; label: string };

export interface Section {
  id: string;
  title: string;
  /** Group label shown above a run of sections (set by splitSections). */
  group?: string;
  open?: boolean;
  items: Item[];
}

const ROOTS: Record<string, Obj> = {
  PLAYER: PLAYER as unknown as Obj,
  RENDER: RENDER as unknown as Obj,
  CAPS: CAPS as unknown as Obj,
  PRESSURE: PRESSURE as unknown as Obj,
  PAINT: PAINT as unknown as Obj,
  SPRAY: SPRAY as unknown as Obj,
  MARKER: MARKER as unknown as Obj,
  VIEWMODEL: VIEWMODEL as unknown as Obj,
  HOLD: HOLD as unknown as Obj,
  ATMOS: ATMOS as unknown as Obj,
  INK: INK as unknown as Obj,
  LIGHTS: LIGHTS as unknown as Obj,
  LIGHTMAP: LIGHTMAP as unknown as Obj,
  VOLUMETRICS: VOLUMETRICS as unknown as Obj,
  GRADE: GRADE as unknown as Obj,
  DRIPS: DRIPS as unknown as Obj,
  PLAYER_LIGHT: PLAYER_LIGHT as unknown as Obj,
  WALL_HAND: WALL_HAND as unknown as Obj,
  DAYLIGHT: DAYLIGHT as unknown as Obj,
  PICKUP: PICKUP as unknown as Obj,
  AUDIO: AUDIO as unknown as Obj,
  THUNDER: THUNDER as unknown as Obj,
  SIRENS: SIRENS as unknown as Obj,
  CCTV: CCTV as unknown as Obj,
  SMOKE: SMOKE as unknown as Obj,
  FANS: FANS as unknown as Obj,
  FLICKER: FLICKER as unknown as Obj,
  SKYLINE: SKYLINE as unknown as Obj,
};

export function getValue(path: string[]): unknown {
  return parentOf(path)[path[path.length - 1]];
}

export function setValue(path: string[], v: unknown) {
  parentOf(path)[path[path.length - 1]] = v;
}

/**
 * The object holding a path's value. While build mode shows daylight, ATMOS
 * holds DAYLIGHT's values for some keys: those read and write the saved night
 * values instead, so the panel (and its copy) always shows the night look.
 */
function parentOf(path: string[]): Obj {
  const night = path[0] === 'ATMOS' ? live.atmosNight() : null;
  const root = night && path[1] in night ? night : ROOTS[path[0]];
  return path.slice(1, -1).reduce<unknown>((o, k) => (o as Obj)[k], root) as Obj;
}

/** Live values filled in by main (stats) and the player state. */
export const live = {
  stats: { fps: 0, frameMs: 0, lights: 0, drawCalls: 0, triangles: 0, textures: 0, textureBytes: 0, surfaces: 0, uploads: 0, uploadBytes: 0, particles: 0, drips: 0, bakedBytes: 0, bakePending: 0, bakeMs: 0 },
  player: null as null | { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; state: string },
  /** Main sets these so sliders can apply side effects. */
  applyPixelScale: () => {},
  rebuildLights: () => {},
  /** Rebuild the light props themselves (lens colors, floodlight heads), then their FX. */
  rebuildLightProps: () => {},
  /** Push ATMOS colors / moon direction into fog, sky and lights. */
  syncAtmosphere: () => {},
  /** Re-apply DAYLIGHT if build mode is showing it. */
  applyDaylight: () => {},
  /** Rebuild the city around the level (SKYLINE changed). */
  rebuildCity: () => {},
  /** Apply live SKYLINE values (line range). */
  syncSkyline: () => {},
  /** Debug: a lightning strike right now. */
  strikeLightning: () => {},
  /** Debug: a far siren right now. */
  siren: () => {},
  /** GPU time of a render pass, as text ('n/a' without timer queries). */
  gpu: (_label: string) => 'n/a',
  /** While build mode shows daylight: the night values it replaced in ATMOS (see Atmosphere). */
  atmosNight: (): Obj | null => null,
};

const r = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item => ({ kind: 'range', label, path, min, max, step, onChange });
const t = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'toggle', label, path, onChange });
const c = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'color', label, path, onChange });
/** Three sliders for a [x, y, z] array value. */
const v3 = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item[] =>
  ['x', 'y', 'z'].map((a, i) => r(`${label} ${a}`, [...path, String(i)], min, max, step, onChange));

const LIGHT_LABELS: Record<string, string> = { wallLamp: 'WALL LAMP', floodlight: 'FLOODLIGHT', neonPink: 'NEON SIGN (PINK)', neonCyan: 'NEON SIGN (CYAN)', billboardLamp: 'BILLBOARD LAMP', lampPost: 'LAMP POST', stringLights: 'STRING LIGHTS', cctv: 'CCTV CAMERA' };

function lightItems(): Item[] {
  const fx = () => live.rebuildLights();
  const props = () => live.rebuildLightProps();
  return Object.keys(LIGHTS).flatMap((k) => [
    { kind: 'heading', label: `LIGHT · ${LIGHT_LABELS[k] ?? k}` } as Item,
    c('color', ['LIGHTS', k, 'color'], props),
    ...v3('source offset', ['LIGHTS', k, 'offset'], -1, 1, 0.01, fx),
    ...v3('aim', ['LIGHTS', k, 'dir'], -1, 1, 0.01, props),
    r('intensity', ['LIGHTS', k, 'intensity'], 0, 200, 0.5),
    r('range (m)', ['LIGHTS', k, 'range'], 1, 80, 0.5, fx),
    r('spread (rad)', ['LIGHTS', k, 'spread'], 0.1, LIGHT_SPREAD_MAX, 0.01, fx),
    r('edge softness', ['LIGHTS', k, 'softness'], 0, 1, 0.05, fx),
    r('glow size', ['LIGHTS', k, 'glow'], 0, 3, 0.05, fx),
    t('glow from all sides', ['LIGHTS', k, 'glowAllAround'], fx),
    r('beam length', ['LIGHTS', k, 'beam'], 0, 20, 0.5, fx),
    t('casts shadows', ['LIGHTS', k, 'shadows']),
  ]);
}

function capItems(): Item[] {
  return CAP_ORDER.flatMap((c) => [
    { kind: 'heading', label: `CAP · ${CAPS[c].name}` } as Item,
    r('opacity per hit', ['CAPS', c, 'strength'], 0.02, 1, 0.01),
    r('dot radius (m)', ['CAPS', c, 'stampRadius'], 0, 0.2, 0.001),
    r('edge softness', ['CAPS', c, 'softness'], 0, 1, 0.05),
    r('particle rate', ['CAPS', c, 'rate'], 50, 2000, 10),
    r('spread', ['CAPS', c, 'coneAngle'], 0.005, 0.3, 0.005),
    { kind: 'color', label: 'cap color', path: ['CAPS', c, 'color'] } as Item,
    r('crosshair (px)', ['CAPS', c, 'crosshair'], 2, 60, 1),
  ]);
}

/** First-person pose of every held tool (HOLD): one heading per tool, same sliders for each. */
function holdItems(): Item[] {
  return (Object.keys(HOLD) as (keyof typeof HOLD)[]).flatMap((tool) => [
    { kind: 'heading', label: `HELD ${tool.toUpperCase()}` } as Item,
    r('distance (m)', ['HOLD', tool, 'distance'], 0.15, 1.2, 0.01),
    r('right (per m)', ['HOLD', tool, 'x'], -1, 1, 0.005),
    r('up (per m)', ['HOLD', tool, 'y'], -1, 0.5, 0.005),
    r('size', ['HOLD', tool, 'scale'], 0.3, 2.5, 0.05),
    r('tilt (rad)', ['HOLD', tool, 'pitch'], -3.14, 3.14, 0.01),
    r('turn (rad)', ['HOLD', tool, 'yaw'], -3.14, 3.14, 0.01),
    r('lean (rad)', ['HOLD', tool, 'roll'], -3.14, 3.14, 0.01),
  ]);
}

/** DAYLIGHT overrides (build mode): numbers as sliders, hex strings as colors. */
function daylightItems(): Item[] {
  const apply = () => live.applyDaylight();
  const ranges: Record<string, [number, number, number]> = {
    fogDensity: [0, 0.05, 0.001], cloudBase: [5, 400, 5], ambient: [0, 4, 0.05], moon: [0, 6, 0.05],
    practical: [0, 4, 0.05], emissiveBoost: [0, 6, 0.1], wetness: [0, 1, 0.01],
  };
  return Object.entries(DAYLIGHT).flatMap(([k, v]): Item[] => {
    if (typeof v === 'string') return [c(k, ['DAYLIGHT', k], apply)];
    if (typeof v === 'boolean') return [t(k, ['DAYLIGHT', k], apply)];
    if (Array.isArray(v)) return v3(k, ['DAYLIGHT', k], -1, 1, 0.01, apply);
    const [min, max, step] = ranges[k] ?? [0, 10, 0.01];
    return [r(k, ['DAYLIGHT', k], min, max, step, apply)];
  });
}

export function sections(): Section[] {
  const sync = () => live.syncAtmosphere();
  const p = () => live.player;
  const v2 = (x: number, y: number) => Math.hypot(x, y).toFixed(2);
  return [
    {
      id: 'movement',
      title: 'Movement',
      items: [
        { kind: 'readout', label: 'position', get: () => (p() ? `${p()!.position.x.toFixed(2)}, ${p()!.position.y.toFixed(2)}, ${p()!.position.z.toFixed(2)}` : '-') },
        { kind: 'readout', label: 'speed', get: () => (p() ? `${v2(p()!.velocity.x, p()!.velocity.z)} m/s` : '-') },
        { kind: 'readout', label: 'vertical', get: () => (p() ? `${p()!.velocity.y.toFixed(2)} m/s` : '-') },
        { kind: 'readout', label: 'state', get: () => p()?.state ?? '-' },
        r('walk speed', ['PLAYER', 'walkSpeed'], 1, 12, 0.1),
        r('sprint speed', ['PLAYER', 'sprintSpeed'], 1, 16, 0.1),
        r('crouch speed', ['PLAYER', 'crouchSpeed'], 0.5, 6, 0.1),
        r('acceleration', ['PLAYER', 'acceleration'], 1, 40, 0.5),
        r('ground friction', ['PLAYER', 'friction'], 1, 40, 0.5),
        r('air control', ['PLAYER', 'airControl'], 0, 1, 0.01),
        r('jump height', ['PLAYER', 'jumpHeight'], 0.2, 3, 0.01),
        r('gravity', ['PLAYER', 'gravity'], 4, 40, 0.5),
        r('ladder climb speed', ['PLAYER', 'climbSpeed'], 0.5, 6, 0.1),
        r('step height', ['PLAYER', 'stepHeight'], 0, 0.8, 0.01),
        r('crouch collider', ['PLAYER', 'crouchHeight'], 0.6, 1.7, 0.01),
        r('ladder jump-off push', ['PLAYER', 'ladderJumpOff'], 0, 10, 0.1),
        { kind: 'heading', label: 'PICKUPS' },
        r('pickup radius', ['PICKUP', 'radius'], 0.2, 3, 0.05),
        r('hover height', ['PICKUP', 'hover'], 0, 2, 0.05),
        r('spin speed', ['PICKUP', 'spin'], 0, 6, 0.1),
        r('bob', ['PICKUP', 'bob'], 0, 0.5, 0.01),
      ],
    },
    {
      id: 'camera',
      title: 'Camera',
      items: [
        r('camera height', ['PLAYER', 'eyeHeight'], 0.8, 1.75, 0.01),
        r('crouch camera height', ['PLAYER', 'crouchEyeHeight'], 0.5, 1.5, 0.01),
        r('crouch transition', ['PLAYER', 'crouchTransition'], 2, 40, 0.5),
        r('step smoothing', ['PLAYER', 'stepSmoothing'], 2, 60, 0.5),
        r('mouse sensitivity', ['PLAYER', 'mouseSensitivity'], 0.0005, 0.006, 0.0001),
        r('FOV', ['RENDER', 'fov'], 50, 110, 1),
        r('sprint FOV boost', ['RENDER', 'sprintFovBoost'], 0, 20, 0.5),
        r('sprint FOV ease', ['RENDER', 'sprintFovEase'], 1, 30, 0.5),
        { kind: 'heading', label: 'HANDS' },
        r('look sway', ['VIEWMODEL', 'swayAmount'], 0, 0.004, 0.0001),
        r('max sway', ['VIEWMODEL', 'swayMax'], 0, 0.3, 0.01),
        r('sway return', ['VIEWMODEL', 'swayReturn'], 1, 30, 0.5),
        r('walk bob', ['VIEWMODEL', 'bobAmount'], 0, 0.03, 0.001),
        r('bob frequency', ['VIEWMODEL', 'bobFrequency'], 0.1, 1.5, 0.05),
        r('jump lag', ['VIEWMODEL', 'fallLag'], 0, 0.01, 0.0005),
        r('trigger press', ['VIEWMODEL', 'pressCurl'], 0, 0.3, 0.01),
        r('trigger speed', ['VIEWMODEL', 'pressSpeed'], 2, 60, 1),
        ...holdItems(),
        { kind: 'heading', label: 'LEFT HAND ON WALLS' },
        r('reach (m)', ['WALL_HAND', 'reach'], 0.3, 1.5, 0.05),
        r('let go at (m)', ['WALL_HAND', 'release'], 0.4, 2, 0.05),
        r('speed', ['WALL_HAND', 'speed'], 1, 20, 0.5),
        r('slide after (m)', ['WALL_HAND', 'slide'], 0.05, 1, 0.05),
        r('look for walls from (° left)', ['WALL_HAND', 'fromAngle'], 0, 90, 1),
        r('look for walls to (° left)', ['WALL_HAND', 'toAngle'], 30, 180, 1),
        r('hand below eyes (m)', ['WALL_HAND', 'drop'], 0, 1, 0.01),
        r('finger lean on wall (rad)', ['WALL_HAND', 'fingerLean'], -1, 1, 0.01),
        r('gap to wall (m)', ['WALL_HAND', 'gap'], 0, 0.05, 0.001),
        ...v3('comes in from (position)', ['WALL_HAND', 'restOffset'], -0.8, 0.8, 0.005),
        ...v3('comes in from (rotation)', ['WALL_HAND', 'restRotation'], -3.14, 3.14, 0.01),
        r('wrist bend coming in (rad)', ['WALL_HAND', 'restWristBend'], -1.5, 1.5, 0.01),
        r('wrist bend on wall (rad)', ['WALL_HAND', 'wallWristBend'], -1.5, 1.5, 0.01),
      ],
    },
    {
      id: 'painting',
      title: 'Painting',
      items: [
        r('spray range', ['SPRAY', 'range'], 1, 8, 0.1),
        r('full strength up to (m)', ['SPRAY', 'falloffStart'], 0, 8, 0.1),
        r('particle speed', ['SPRAY', 'particleSpeed'], 2, 40, 0.5),
        r('alpha steps (0 = smooth)', ['PAINT', 'alphaSteps'], 0, 12, 1),
        { kind: 'heading', label: 'MARKER' },
        r('reach', ['MARKER', 'reach'], 0.5, 4, 0.1),
        r('nib half-width (m, 0 = one texel)', ['MARKER', 'radius'], 0, 0.2, 0.001),
        r('runs (x paint runs per m²)', ['MARKER', 'drips'], 0, 40, 0.5),
        r('line opacity', ['MARKER', 'strength'], 0.05, 1, 0.01),
        { kind: 'heading', label: 'PAINT RUNS' },
        t('runs', ['DRIPS', 'enabled']),
        r('excess before a run (coats)', ['DRIPS', 'excess'], 0.5, 10, 0.1),
        r('runs per m² at the limit', ['DRIPS', 'perSquareMeter'], 0, 200, 1),
        r('max at once', ['DRIPS', 'maxActive'], 0, 200, 1),
        r('min length (m)', ['DRIPS', 'minLength'], 0.02, 1, 0.01),
        r('max length (m)', ['DRIPS', 'maxLength'], 0.02, 1.5, 0.01),
        r('speed (m/s)', ['DRIPS', 'speed'], 0.01, 1, 0.01),
        r('opacity', ['DRIPS', 'strength'], 0.1, 1, 0.05),
        ...capItems(),
      ],
    },
    {
      id: 'pressure',
      title: 'Pressure',
      items: [
        r('drain / s', ['PRESSURE', 'drainPerSecond'], 0, 0.3, 0.005),
        r('thin below', ['PRESSURE', 'thinThreshold'], 0, 1, 0.01),
        r('sputter below', ['PRESSURE', 'sputterThreshold'], 0, 1, 0.01),
        r('flow at sputter', ['PRESSURE', 'minSteadyFlow'], 0, 1, 0.01),
        r('sputter duty', ['PRESSURE', 'sputterDuty'], 0, 1, 0.01),
        r('shake restore', ['PRESSURE', 'shakeRestore'], 0, 1, 0.01),
        r('shake duration', ['PRESSURE', 'shakeDuration'], 0.1, 2, 0.05),
      ],
    },
    {
      id: 'rendering',
      title: 'Rendering',
      items: [
        r('pixel scale', ['RENDER', 'pixelScale'], 1, 5, 0.25, () => live.applyPixelScale()),
        { kind: 'heading', label: 'WEATHER' },
        t('rain', ['ATMOS', 'rain']),
        r('rain density', ['ATMOS', 'rainDensity'], 0, 1, 0.01),
        r('rain speed', ['ATMOS', 'rainSpeed'], 4, 30, 0.5),
        c('rain color', ['ATMOS', 'rainColor']),
        r('rain opacity', ['ATMOS', 'rainOpacity'], 0, 4, 0.05),
        ...v3('wind', ['ATMOS', 'wind'], -5, 5, 0.1),
        r('fade into paper (1/m)', ['ATMOS', 'fogDensity'], 0, 0.03, 0.0005),
        r('cloud base', ['ATMOS', 'cloudBase'], 5, 80, 1),
        r('cloud fade', ['ATMOS', 'cloudFade'], 2, 120, 1),
        r('wetness', ['ATMOS', 'wetness'], 0, 1, 0.01),
        { kind: 'heading', label: 'LIGHT' },
        t('moon shadows', ['ATMOS', 'shadows']),
        t('spot light shadows (bake off)', ['ATMOS', 'spotShadows']),
        r('shadow range', ['ATMOS', 'shadowRange'], 8, 60, 1),
        r('light props', ['ATMOS', 'practical'], 0, 4, 0.05),
        r('real light budget (bake off)', ['ATMOS', 'lightBudget'], 0, 8, 1),
        r('emissive boost', ['ATMOS', 'emissiveBoost'], 0, 6, 0.1),
        ...v3('moon direction', ['ATMOS', 'moonDir'], -1, 1, 0.01, sync),
        { kind: 'heading', label: 'CITY' },
        r('city opacity', ['SKYLINE', 'opacity'], 0, 1, 0.01),
        r('lit windows', ['SKYLINE', 'litWindows'], 0, 1, 0.01),
        r('thin lines visible to (x)', ['SKYLINE', 'lineRange'], 0, 3, 0.05, () => live.syncSkyline()),
        r('seed', ['SKYLINE', 'seed'], 1, 100, 1),
        r('radius (m)', ['SKYLINE', 'radius'], 100, 1200, 10),
        r('block pitch (m)', ['SKYLINE', 'block'], 20, 120, 1),
        r('street min (m)', ['SKYLINE', 'streetMin'], 2, 40, 0.5),
        r('street max (m)', ['SKYLINE', 'streetMax'], 2, 40, 0.5),
        r('margin round the level (m)', ['SKYLINE', 'margin'], 0, 60, 1),
        r('street height (m)', ['SKYLINE', 'street'], -300, -10, 1),
        r('near ring (m)', ['SKYLINE', 'near'], 0, 600, 5),
        r('huge tower share', ['SKYLINE', 'tallChance'], 0, 1, 0.01),
        r('huge tower min top (m)', ['SKYLINE', 'tallMin'], -50, 300, 1),
        r('huge tower max top (m)', ['SKYLINE', 'tallMax'], -50, 400, 1),
        r('rooftop clutter range (m)', ['SKYLINE', 'clutterRange'], 0, 800, 10),
        { kind: 'action', label: 'rebuild city', run: () => live.rebuildCity() },
      ],
    },
    {
      id: 'ink',
      title: 'Ink',
      items: [
        c('paper', ['INK', 'paper']),
        c('ink', ['INK', 'ink']),
        c('sky', ['INK', 'sky']),
        c('clouds', ['INK', 'cloud']),
        r('exposure', ['INK', 'exposure'], 0.2, 5, 0.05),
        r('paper above tone', ['INK', 'paperTone'], 0, 1.5, 0.01),
        r('cross-hatch below', ['INK', 'hatchTone'], 0, 1, 0.01),
        r('solid ink below', ['INK', 'blackTone'], 0, 1, 0.01),
        r('ragged tone edges', ['INK', 'toneNoise'], 0, 0.3, 0.005),
        r('hatch spacing (px)', ['INK', 'hatchPx'], 2, 16, 0.5),
        r('hatch line width', ['INK', 'hatchWidth'], 0.05, 0.9, 0.01),
        r('grime', ['INK', 'grime'], 0, 2, 0.05),
        r('void starts (m)', ['INK', 'voidTop'], -100, 40, 1),
        r('void is black at (m)', ['INK', 'voidBottom'], -150, 20, 1),
        { kind: 'heading', label: 'OUTLINES + PAPER' },
        r('outlines', ['INK', 'outline'], 0, 2, 0.05),
        r('crease sensitivity', ['INK', 'crease'], 0, 4, 0.05),
        r('outlines thin out over (m)', ['INK', 'outlineFade'], 10, 1000, 5),
        r('wobble (px)', ['INK', 'wobble'], 0, 3, 0.05),
        r('paper grain', ['INK', 'grain'], 0, 3, 0.05),
        { kind: 'heading', label: 'PAINT' },
        r('paint light', ['INK', 'paintLight'], 0.2, 4, 0.05),
        r('paint darkest', ['INK', 'paintMin'], 0, 1, 0.01),
        r('hatching over paint', ['INK', 'paintHatch'], 0, 1, 0.01),
      ],
    },
    {
      id: 'post',
      title: 'Volumetrics + grading',
      items: [
        { kind: 'heading', label: 'VOLUMETRICS' },
        t('volumetric light', ['VOLUMETRICS', 'enabled']),
        r('resolution divisor', ['VOLUMETRICS', 'downscale'], 1, 8, 1),
        r('steps', ['VOLUMETRICS', 'steps'], 4, 32, 1),
        r('max distance', ['VOLUMETRICS', 'maxDistance'], 5, 120, 1),
        r('density', ['VOLUMETRICS', 'density'], 0, 0.2, 0.001),
        r('moon shafts', ['VOLUMETRICS', 'moon'], 0, 3, 0.05),
        r('light scatter', ['VOLUMETRICS', 'lights'], 0, 5, 0.05),
        r('forward scatter', ['VOLUMETRICS', 'anisotropy'], 0, 0.9, 0.01),
        { kind: 'heading', label: 'COLOR GRADING' },
        r('exposure (stops)', ['GRADE', 'exposure'], -3, 3, 0.05),
        r('contrast', ['GRADE', 'contrast'], 0.5, 2, 0.01),
        r('saturation', ['GRADE', 'saturation'], 0, 2, 0.01),
        r('temperature', ['GRADE', 'temperature'], -1, 1, 0.01),
        r('tint', ['GRADE', 'tint'], -1, 1, 0.01),
      ],
    },
    {
      id: 'sound',
      title: 'Sound',
      items: [
        r('master', ['AUDIO', 'masterGain'], 0, 1.5, 0.01),
        r('rain', ['AUDIO', 'rainGain'], 0, 0.5, 0.005),
        r('rain brightness (Hz)', ['AUDIO', 'rainTone'], 500, 9000, 50),
        r('drops on metal', ['AUDIO', 'metalGain'], 0, 0.4, 0.005),
        r('drops on metal / s per piece', ['AUDIO', 'metalRate'], 0, 10, 0.1),
        r('drops on metal heard within (m)', ['AUDIO', 'metalRange'], 1, 20, 0.5),
        r('thunder', ['AUDIO', 'thunderGain'], 0, 1.5, 0.01),
        r('far sirens', ['AUDIO', 'sirenGain'], 0, 0.6, 0.005),
        r('city ambience', ['AUDIO', 'ambienceGain'], 0, 0.3, 0.005),
        r('AC fan hum', ['AUDIO', 'fanGain'], 0, 0.5, 0.005),
        r('fan heard within (m)', ['AUDIO', 'fanRange'], 1, 20, 0.5),
        r('spray hiss', ['AUDIO', 'hissGain'], 0, 0.8, 0.01),
        r('footsteps', ['AUDIO', 'footstepGain'], 0, 1, 0.01),
      ],
    },
    {
      id: 'weather-fx',
      title: 'Lightning, smoke, fans, flicker',
      items: [
        { kind: 'heading', label: 'LIGHTNING' },
        t('lightning + thunder', ['THUNDER', 'enabled']),
        { kind: 'action', label: 'STRIKE NOW', run: () => live.strikeLightning() },
        r('min seconds between', ['THUNDER', 'minInterval'], 5, 300, 1),
        r('max seconds between', ['THUNDER', 'maxInterval'], 5, 600, 1),
        r('flash: ambient', ['THUNDER', 'flashAmbient'], 0, 20, 0.5),
        r('flash: moon', ['THUNDER', 'flashMoon'], 0, 20, 0.5),
        r('flash: sky', ['THUNDER', 'flashSky'], 0, 2, 0.05),
        r('thunder delay min (s)', ['THUNDER', 'minDelay'], 0, 5, 0.1),
        r('thunder delay max (s)', ['THUNDER', 'maxDelay'], 0, 10, 0.1),
        { kind: 'heading', label: 'FAR SIRENS' },
        t('sirens', ['SIRENS', 'enabled']),
        { kind: 'action', label: 'SIREN NOW', run: () => live.siren() },
        r('min seconds between', ['SIRENS', 'minInterval'], 5, 600, 1),
        r('max seconds between', ['SIRENS', 'maxInterval'], 5, 900, 1),
        { kind: 'heading', label: 'CCTV CAMERAS' },
        r('start following within (m)', ['CCTV', 'followRange'], 1, 30, 0.5),
        r('follow fully within (m)', ['CCTV', 'lockRange'], 0, 20, 0.5),
        r('max head turn (rad)', ['CCTV', 'maxTurn'], 0.2, 1.57, 0.01),
        { kind: 'heading', label: 'SMOKE (EXHAUST PIPES)' },
        t('smoke', ['SMOKE', 'enabled']),
        r('puffs per source', ['SMOKE', 'perEmitter'], 0, 48, 1),
        r('life (s)', ['SMOKE', 'life'], 0.5, 12, 0.1),
        r('rise (m)', ['SMOKE', 'rise'], 0, 8, 0.1),
        r('wind drift', ['SMOKE', 'drift'], 0, 3, 0.05),
        r('start size (m)', ['SMOKE', 'startSize'], 0.02, 1, 0.01),
        r('end size (m)', ['SMOKE', 'endSize'], 0.1, 4, 0.05),
        r('opacity', ['SMOKE', 'opacity'], 0, 1, 0.01),
        c('color', ['SMOKE', 'color']),
        { kind: 'heading', label: 'AC FANS' },
        r('revolutions / s', ['FANS', 'speed'], 0, 15, 0.1),
        { kind: 'heading', label: 'FLICKER' },
        r('steps / s', ['FLICKER', 'speed'], 1, 40, 1),
        r('neon: dip chance', ['FLICKER', 'neonRate'], 0, 0.5, 0.005),
        r('neon: dip depth', ['FLICKER', 'neonDepth'], 0, 1, 0.01),
        r('neon: hum', ['FLICKER', 'neonHum'], 0, 0.3, 0.005),
      ],
    },
    {
      id: 'daylight',
      title: 'Build-mode daylight',
      items: daylightItems(),
    },
    {
      id: 'lights',
      title: 'Lights',
      items: [
        r('falloff (2 = physical)', ['ATMOS', 'lightDecay'], 0.5, 2.5, 0.05),
        { kind: 'heading', label: 'BAKED LIGHT' },
        t('bake lamp light', ['LIGHTMAP', 'enabled']),
        t('shadows', ['LIGHTMAP', 'shadows']),
        r('light texels per meter', ['LIGHTMAP', 'texelsPerMeter'], 1, 16, 1),
        t('smooth light texels', ['LIGHTMAP', 'smooth']),
        r('wet highlights (nearest lamps)', ['LIGHTMAP', 'highlights'], 0, 4, 1),
        r('bake time per frame (ms)', ['LIGHTMAP', 'budgetMs'], 0.5, 16, 0.5),
        { kind: 'readout', label: 'bake', get: () => (live.stats.bakePending ? `${live.stats.bakePending} parts left` : 'done') },
        { kind: 'heading', label: 'MOONLIGHT' },
        r('intensity', ['ATMOS', 'moon'], 0, 6, 0.05),
        c('color', ['ATMOS', 'moonColor'], sync),
        { kind: 'heading', label: 'AMBIENT' },
        r('intensity', ['ATMOS', 'ambient'], 0, 4, 0.05),
        c('sky color', ['ATMOS', 'ambientSky'], sync),
        c('ground color', ['ATMOS', 'ambientGround'], sync),
        { kind: 'heading', label: 'HANDS (VIEW MODEL)' },
        r('fill', ['VIEWMODEL', 'fill'], 0, 4, 0.05),
        c('fill from above', ['VIEWMODEL', 'fillSky']),
        c('fill from below', ['VIEWMODEL', 'fillGround']),
        r('rim', ['VIEWMODEL', 'rim'], 0, 4, 0.05),
        c('rim color', ['VIEWMODEL', 'rimColor']),
        { kind: 'heading', label: 'PLAYER GLOW' },
        r('intensity', ['PLAYER_LIGHT', 'intensity'], 0, 4, 0.05),
        r('range (m)', ['PLAYER_LIGHT', 'range'], 1, 15, 0.5),
        r('height above eyes', ['PLAYER_LIGHT', 'height'], 0, 1.5, 0.05),
        c('color', ['PLAYER_LIGHT', 'color']),
        ...lightItems(),
      ],
    },
    {
      id: 'performance',
      title: 'Performance',
      open: true,
      items: [
        { kind: 'readout', label: 'fps', get: () => `${live.stats.fps.toFixed(0)}  (${live.stats.frameMs.toFixed(1)} ms cpu)` },
        { kind: 'readout', label: 'gpu: scene', get: () => live.gpu('scene') },
        { kind: 'readout', label: 'gpu: volumetrics', get: () => live.gpu('volumetrics') },
        { kind: 'readout', label: 'gpu: hands + post', get: () => live.gpu('post') },
        { kind: 'readout', label: 'draw calls', get: () => `${live.stats.drawCalls}` },
        { kind: 'readout', label: 'real lights', get: () => `${live.stats.lights}` },
        { kind: 'readout', label: 'baked light', get: () => `${(live.stats.bakedBytes / 1048576).toFixed(2)} MB, ${live.stats.bakeMs.toFixed(1)} ms` },
        { kind: 'readout', label: 'triangles', get: () => `${live.stats.triangles}` },
        { kind: 'readout', label: 'paint tex', get: () => `${live.stats.textures} / ${live.stats.surfaces} surfaces` },
        { kind: 'readout', label: 'tex memory', get: () => `${(live.stats.textureBytes / 1048576).toFixed(2)} MB` },
        { kind: 'readout', label: 'uploads', get: () => `${live.stats.uploads} tex, ${(live.stats.uploadBytes / 1024).toFixed(1)} KB` },
        { kind: 'readout', label: 'particles', get: () => `${live.stats.particles}` },
        { kind: 'readout', label: 'paint runs', get: () => `${live.stats.drips}` },
      ],
    },
  ];
}

/**
 * Every authored section becomes a group; its items are split at headings into
 * one collapsible section per heading (items before the first heading keep the
 * title "general"), so each part can be opened on its own.
 */
export function splitSections(list: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of list) {
    const split = s.items.some((it) => it.kind === 'heading');
    let cur: Section = { id: `${s.id}:general`, title: split ? 'general' : s.title, group: s.title, open: s.open, items: [] };
    const flush = () => {
      if (cur.items.length) out.push(cur);
    };
    for (const it of s.items) {
      if (it.kind === 'heading') {
        flush();
        const slug = it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        cur = { id: `${s.id}:${slug}`, title: it.label.toLowerCase(), group: s.title, items: [] };
      } else cur.items.push(it);
    }
    flush();
  }
  return out;
}

/** Values of the given sections as nested JSON mirroring config.ts. */
export function sectionsJSON(list: Section[]) {
  const out: Obj = {};
  for (const s of list) {
    for (const it of s.items) {
      if (it.kind !== 'range' && it.kind !== 'toggle' && it.kind !== 'color') continue;
      let o = out;
      // Numeric keys are array slots ([x, y, z] values copy back as arrays).
      it.path.slice(0, -1).forEach((k, i) => (o = (o[k] ??= /^\d+$/.test(it.path[i + 1]) ? [] : {}) as Obj));
      o[it.path[it.path.length - 1]] = getValue(it.path);
    }
  }
  return JSON.stringify(out, null, 2);
}
