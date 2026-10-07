import { DAYLIGHT } from '../config';
import { live, r, t, c, v3, type Item, type Section } from './tuning';

// F3 panel contents for the world (tuning.ts has the helpers).

/** DAYLIGHT overrides (build mode): numbers as sliders, hex strings as colors. */
function daylightItems(): Item[] {
  const apply = () => live.applyDaylight();
  const ranges: Record<string, [number, number, number]> = {
    fogDensity: [0, 0.05, 0.001], cloudBase: [5, 400, 5], ambient: [0, 4, 0.05], moon: [0, 6, 0.05],
    practical: [0, 4, 0.05], emissiveBoost: [0, 6, 0.1], wetness: [0, 1, 0.01], moonHeight: [0, 90, 0.1], moonHeading: [0, 360, 0.1],
  };
  return Object.entries(DAYLIGHT).flatMap(([k, v]): Item[] => {
    if (typeof v === 'string') return [c(k, ['DAYLIGHT', k], apply)];
    if (typeof v === 'boolean') return [t(k, ['DAYLIGHT', k], apply)];
    if (Array.isArray(v)) return v3(k, ['DAYLIGHT', k], -1, 1, 0.01, apply);
    const [min, max, step] = ranges[k] ?? [0, 10, 0.01];
    return [r(k, ['DAYLIGHT', k], min, max, step, apply)];
  });
}

/** F3 sections for the world: weather, props, city, sound, daylight, and performance (Test). */
export function worldSections(): Section[] {
  return [
    {
      id: 'city',
      title: 'City',
      items: [
        r('city opacity', ['SKYLINE', 'opacity'], 0, 1, 0.01),
        r('lit windows', ['SKYLINE', 'litWindows'], 0, 1, 0.01),
        r('thin lines visible to (x)', ['SKYLINE', 'lineRange'], 0, 3, 0.05, () => live.syncSkyline()),
        r('seed', ['SKYLINE', 'seed'], 1, 100, 1),
        r('radius (m)', ['SKYLINE', 'radius'], 100, 1200, 10),
        r('full height from (m)', ['SKYLINE', 'riseTo'], 100, 1200, 10),
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
        r('city ambience', ['AUDIO', 'ambienceGain'], 0, 0.3, 0.005),
        r('AC fan hum', ['AUDIO', 'fanGain'], 0, 0.5, 0.005),
        r('fan heard within (m)', ['AUDIO', 'fanRange'], 1, 20, 0.5),
        r('spray hiss', ['AUDIO', 'hissGain'], 0, 0.8, 0.01),
        r('footsteps', ['AUDIO', 'footstepGain'], 0, 1, 0.01),
      ],
    },
    {
      id: 'weather',
      title: 'Weather',
      items: [
        t('rain', ['ATMOS', 'rain']),
        r('rain density', ['ATMOS', 'rainDensity'], 0, 1, 0.01),
        r('rain speed', ['ATMOS', 'rainSpeed'], 4, 30, 0.5),
        c('rain color', ['ATMOS', 'rainColor']),
        r('rain opacity', ['ATMOS', 'rainOpacity'], 0, 4, 0.05),
        r('wind: strength', ['ATMOS', 'windStrength'], 0, 10, 0.1),
        r('wind: heading', ['ATMOS', 'windHeading'], 0, 360, 0.1),
        r('fade into paper (1/m)', ['ATMOS', 'fogDensity'], 0, 0.03, 0.0005),
        r('cloud base', ['ATMOS', 'cloudBase'], 5, 80, 1),
        r('cloud fade', ['ATMOS', 'cloudFade'], 2, 120, 1),
        r('wetness', ['ATMOS', 'wetness'], 0, 1, 0.01),
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
      ],
    },
    {
      id: 'props',
      title: 'Props',
      items: [
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
        { kind: 'readout', label: 'paint ops / s', get: () => `${live.stats.paintOps.toFixed(0)}` },
        { kind: 'readout', label: 'uploads', get: () => `${live.stats.uploads} rects, ${(live.stats.uploadBytes / 1024).toFixed(1)} KB` },
        { kind: 'readout', label: 'particles', get: () => `${live.stats.particles}` },
        { kind: 'readout', label: 'paint runs', get: () => `${live.stats.drips}` },
      ],
    },
  ];
}
