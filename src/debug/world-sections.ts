import { live, r, t, gray, type Item, type Section } from './tuning';

// F3 panel contents for the world (tuning.ts has the helpers): weather, props
// and the city; and Test → Performance.

/** City layout rows (SKYLINE): each rebuilds the city when the slider is let go (a moment's work, too slow per tick). */
function layout(rows: [label: string, key: string, min: number, max: number, step: number][]): Item[] {
  return rows.map(([label, key, min, max, step]) => ({ ...r(label, ['SKYLINE', key], min, max, step), onRelease: () => live.rebuildCity() }));
}

/** F3 sections for the world: weather, props, city, and performance (Test). */
export function worldSections(): Section[] {
  return [
    {
      id: 'weather',
      title: 'Weather',
      items: [
        r('haze', ['ATMOS', 'fogDensity'], 0, 0.03, 0.0005),
        r('clouds: base', ['ATMOS', 'cloudBase'], 5, 80, 1),
        r('clouds: fade', ['ATMOS', 'cloudFade'], 2, 120, 1),
        r('wetness', ['ATMOS', 'wetness'], 0, 1, 0.01),
        r('wind: strength', ['ATMOS', 'windStrength'], 0, 10, 0.1),
        r('wind: heading', ['ATMOS', 'windHeading'], 0, 360, 0.1),
        { kind: 'heading', label: 'RAIN' },
        t('on', ['ATMOS', 'rain']),
        r('density', ['ATMOS', 'rainDensity'], 0, 1, 0.01),
        r('speed', ['ATMOS', 'rainSpeed'], 4, 30, 0.5),
        gray('color', ['ATMOS', 'rainColor']),
        r('opacity', ['ATMOS', 'rainOpacity'], 0, 4, 0.05),
        { kind: 'heading', label: 'LIGHTNING' },
        t('on', ['THUNDER', 'enabled']),
        { kind: 'action', label: 'STRIKE NOW', run: () => live.strikeLightning() },
        r('interval: min', ['THUNDER', 'minInterval'], 5, 300, 1),
        r('interval: max', ['THUNDER', 'maxInterval'], 5, 600, 1),
        r('flash: ambient', ['THUNDER', 'flashAmbient'], 0, 20, 0.5),
        r('flash: moon', ['THUNDER', 'flashMoon'], 0, 20, 0.5),
        r('flash: sky', ['THUNDER', 'flashSky'], 0, 2, 0.05),
      ],
    },
    {
      id: 'props',
      title: 'Props',
      items: [
        { kind: 'heading', label: 'CCTV CAMERAS' },
        r('follow: from', ['CCTV', 'followRange'], 1, 30, 0.5),
        r('follow: full', ['CCTV', 'lockRange'], 0, 20, 0.5),
        r('max turn', ['CCTV', 'maxTurn'], 0.2, 1.57, 0.01),
        { kind: 'heading', label: 'SMOKE' },
        t('on', ['SMOKE', 'enabled']),
        r('puffs', ['SMOKE', 'perEmitter'], 0, 48, 1),
        r('life', ['SMOKE', 'life'], 0.5, 12, 0.1),
        r('rise', ['SMOKE', 'rise'], 0, 8, 0.1),
        r('drift', ['SMOKE', 'drift'], 0, 3, 0.05),
        r('size: start', ['SMOKE', 'startSize'], 0.005, 1, 0.005),
        r('size: end', ['SMOKE', 'endSize'], 0.1, 4, 0.05),
        r('opacity', ['SMOKE', 'opacity'], 0, 1, 0.01),
        gray('color', ['SMOKE', 'color']),
        { kind: 'heading', label: 'AC FANS' },
        r('speed', ['FANS', 'speed'], 0, 15, 0.1),
        { kind: 'heading', label: 'FLICKER' },
        r('speed', ['FLICKER', 'speed'], 1, 40, 1),
        r('neon: dip chance', ['FLICKER', 'neonRate'], 0, 0.5, 0.005),
        r('neon: dip depth', ['FLICKER', 'neonDepth'], 0, 1, 0.01),
        r('neon: hum', ['FLICKER', 'neonHum'], 0, 0.3, 0.005),
        r('aviation: pulse rate', ['FLICKER', 'pulseRate'], 0.05, 3, 0.05),
        r('aviation: dip depth', ['FLICKER', 'pulseDepth'], 0, 1, 0.01),
        r('broken: dip chance', ['FLICKER', 'brokenRate'], 0, 1, 0.01),
        r('broken: dip depth', ['FLICKER', 'brokenDepth'], 0, 1, 0.01),
      ],
    },
    {
      id: 'city',
      title: 'City',
      items: [
        r('opacity', ['SKYLINE', 'opacity'], 0, 1, 0.01),
        r('lit windows', ['SKYLINE', 'litWindows'], 0, 1, 0.01),
        r('line range', ['SKYLINE', 'lineRange'], 0, 3, 0.05, () => live.syncSkyline()),
        { kind: 'heading', label: 'LAYOUT' },
        { kind: 'action', label: 'REBUILD', run: () => live.rebuildCity() },
        ...layout([
          ['seed', 'seed', 1, 100, 1],
          ['reach', 'radius', 100, 1200, 10],
          ['full height at', 'riseTo', 100, 1200, 10],
          ['margin', 'margin', 0, 60, 1],
          ['block size', 'block', 20, 120, 1],
          ['street: min', 'streetMin', 2, 40, 0.5],
          ['street: max', 'streetMax', 2, 40, 0.5],
          ['street level', 'street', -300, -10, 1],
          ['near: reach', 'near', 0, 600, 5],
          ['towers: share', 'tallChance', 0, 1, 0.01],
          ['towers: min top', 'tallMin', -50, 300, 1],
          ['towers: max top', 'tallMax', -50, 400, 1],
          ['clutter: reach', 'clutterRange', 0, 800, 10],
        ]),
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
        { kind: 'readout', label: 'paint ops / s', get: () => `${live.stats.paintOps.toFixed(0)}` },
        { kind: 'readout', label: 'uploads', get: () => `${live.stats.uploads} rects, ${(live.stats.uploadBytes / 1024).toFixed(1)} KB` },
        { kind: 'readout', label: 'particles', get: () => `${live.stats.particles}` },
        { kind: 'readout', label: 'paint runs', get: () => `${live.stats.drips}` },
        { kind: 'readout', label: 'profiling', get: () => live.profileState() },
        { kind: 'action', label: 'PROFILE', run: () => live.profileToggle() },
        { kind: 'action', label: 'PROBE', run: () => live.profileProbe() },
      ],
    },
  ];
}
