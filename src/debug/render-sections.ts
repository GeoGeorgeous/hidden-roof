import { type LightKind, type NeonColor, LIGHT_SPREAD_MAX, LIGHTS, NEON_COLORS } from '../config';
import { live, r, t, c, v3, type Item, type Section } from './tuning';

// F3 panel contents for rendering (tuning.ts has the helpers): the ink
// shaders, the scene's light, the light props, the final pass, and the HUD
// (its own UI tab).

const LIGHT_LABELS: Record<LightKind, string> = {
  wallLamp: 'WALL LAMP',
  floodlight: 'FLOODLIGHT',
  neon: 'NEON SIGNS',
  billboardLamp: 'BILLBOARD LAMP',
  lampPost: 'LAMP POST',
  stringLights: 'STRING LIGHTS',
  cctv: 'CCTV CAMERA',
};

/** One section per light kind, the same rows for each; neon signs have a color each. */
function lightItems(): Item[] {
  const fx = () => live.rebuildLights();
  const props = () => live.rebuildLightProps();
  return (Object.keys(LIGHTS) as LightKind[]).flatMap((k) => [
    { kind: 'heading', label: LIGHT_LABELS[k] } as Item,
    ...(k === 'neon'
      ? (Object.keys(NEON_COLORS) as NeonColor[]).map((n) => c(`color: ${n}`, ['NEON_COLORS', n], props))
      : [c('color', ['LIGHTS', k, 'color'], props)]),
    r('tint', ['LIGHTS', k, 'tint'], 0, 1, 0.05, props),
    r('intensity', ['LIGHTS', k, 'intensity'], 0, 200, 0.5),
    r('reach', ['LIGHTS', k, 'range'], 1, 80, 0.5, fx),
    r('spread', ['LIGHTS', k, 'spread'], 0.1, LIGHT_SPREAD_MAX, 0.01, fx),
    r('softness', ['LIGHTS', k, 'softness'], 0, 1, 0.05, fx),
    r('glow size', ['LIGHTS', k, 'glow'], 0, 3, 0.05, fx),
    r('beam length', ['LIGHTS', k, 'beam'], 0, 20, 0.5, fx),
  ]);
}

/** F3 sections for the Render tab: shaders, lights, light props, post. */
export function renderSections(): Section[] {
  const sync = () => live.syncAtmosphere();
  const vignette = () => live.syncVignette();
  return [
    {
      id: 'shaders',
      title: 'Shaders',
      items: [
        c('paper', ['INK', 'paper']),
        c('ink', ['INK', 'ink']),
        c('sky', ['INK', 'sky']),
        c('clouds', ['INK', 'cloud']),
        { kind: 'heading', label: 'TONES' },
        r('light', ['INK', 'exposure'], 0.2, 5, 0.05),
        r('paper: from', ['INK', 'paperTone'], 0, 1.5, 0.01),
        r('cross-hatch: below', ['INK', 'hatchTone'], 0, 1, 0.01),
        r('solid: below', ['INK', 'blackTone'], 0, 1, 0.01),
        r('tone noise', ['INK', 'toneNoise'], 0, 0.3, 0.005),
        { kind: 'heading', label: 'HATCHING' },
        r('spacing', ['INK', 'hatchPx'], 2, 16, 0.5),
        r('width', ['INK', 'hatchWidth'], 0.05, 0.9, 0.01),
        r('opacity', ['INK', 'hatchOpacity'], 0, 1, 0.05),
        { kind: 'heading', label: 'OUTLINES' },
        r('strength', ['INK', 'outline'], 0, 2, 0.05),
        r('creases', ['INK', 'crease'], 0, 4, 0.05),
        r('fade', ['INK', 'outlineFade'], 10, 1000, 5),
        { kind: 'heading', label: 'SURFACES' },
        r('grain', ['INK', 'grain'], 0, 3, 0.05),
        r('grime', ['INK', 'grime'], 0, 2, 0.05),
        r('light tint', ['INK', 'tint'], 0, 1, 0.05),
        { kind: 'heading', label: 'VOID' },
        r('top', ['INK', 'voidTop'], -100, 40, 1),
        r('black at', ['INK', 'voidBottom'], -150, 20, 1),
        { kind: 'heading', label: 'PAINT' },
        r('opacity steps', ['PAINT', 'alphaSteps'], 0, 12, 1),
        r('light', ['INK', 'paintLight'], 0.2, 4, 0.05),
        r('darkest', ['INK', 'paintMin'], 0, 1, 0.01),
        r('hatching', ['INK', 'paintHatch'], 0, 1, 0.01),
      ],
    },
    {
      id: 'lighting',
      title: 'Lights',
      items: [
        t('moon shadows', ['ATMOS', 'shadows']),
        r('shadow range', ['ATMOS', 'shadowRange'], 8, 60, 1),
        r('shadow detail', ['ATMOS', 'shadowDetail'], 512, 4096, 512),
        { kind: 'heading', label: 'MOONLIGHT' },
        r('intensity', ['ATMOS', 'moon'], 0, 6, 0.05),
        c('color', ['ATMOS', 'moonColor'], sync),
        ...v3('direction', ['ATMOS', 'moonDir'], -1, 1, 0.01, sync),
        { kind: 'heading', label: 'AMBIENT' },
        r('intensity', ['ATMOS', 'ambient'], 0, 4, 0.05),
        c('sky color', ['ATMOS', 'ambientSky'], sync),
        c('ground color', ['ATMOS', 'ambientGround'], sync),
        { kind: 'heading', label: 'HANDS' },
        r('fill', ['VIEWMODEL', 'fill'], 0, 4, 0.05),
        c('fill: above', ['VIEWMODEL', 'fillSky']),
        c('fill: below', ['VIEWMODEL', 'fillGround']),
        r('rim', ['VIEWMODEL', 'rim'], 0, 4, 0.05),
        c('rim: color', ['VIEWMODEL', 'rimColor']),
        { kind: 'heading', label: 'PLAYER GLOW' },
        t('on', ['PLAYER_LIGHT', 'enabled']),
        r('intensity', ['PLAYER_LIGHT', 'intensity'], 0, 4, 0.05),
        r('reach', ['PLAYER_LIGHT', 'range'], 1, 15, 0.5),
        r('height', ['PLAYER_LIGHT', 'height'], 0, 1.5, 0.05),
        c('color', ['PLAYER_LIGHT', 'color']),
      ],
    },
    {
      id: 'light-props',
      title: 'Light props',
      items: [
        r('brightness', ['ATMOS', 'practical'], 0, 4, 0.05),
        r('falloff', ['ATMOS', 'lightDecay'], 0.5, 2.5, 0.05),
        r('glow brightness', ['ATMOS', 'emissiveBoost'], 0, 6, 0.1),
        { kind: 'heading', label: 'BAKED LIGHT' },
        { kind: 'readout', label: 'bake', get: () => (live.stats.bakePending ? `${live.stats.bakePending} parts left` : 'done') },
        t('on', ['LIGHTMAP', 'enabled']),
        t('shadows', ['LIGHTMAP', 'shadows']),
        r('detail', ['LIGHTMAP', 'texelsPerMeter'], 1, 16, 1),
        r('wet highlights', ['LIGHTMAP', 'highlights'], 0, 4, 1),
        r('bake time', ['LIGHTMAP', 'budgetMs'], 0.5, 16, 0.5),
        { kind: 'heading', label: 'REAL LIGHTS' },
        t('spot shadows', ['ATMOS', 'spotShadows']),
        r('light budget', ['ATMOS', 'lightBudget'], 0, 8, 1),
        ...lightItems(),
      ],
    },
    {
      id: 'post',
      title: 'Post',
      items: [
        r('brightness', ['GRADE', 'exposure'], -3, 3, 0.05),
        { kind: 'heading', label: 'VOLUMETRICS' },
        t('on', ['VOLUMETRICS', 'enabled']),
        r('resolution', ['VOLUMETRICS', 'downscale'], 1, 8, 1),
        r('steps', ['VOLUMETRICS', 'steps'], 4, 32, 1),
        r('reach', ['VOLUMETRICS', 'maxDistance'], 5, 120, 1),
        r('density', ['VOLUMETRICS', 'density'], 0, 0.2, 0.001),
        r('moon: strength', ['VOLUMETRICS', 'moon'], 0, 3, 0.05),
        r('lamps: strength', ['VOLUMETRICS', 'lights'], 0, 5, 0.05),
        r('forward scatter', ['VOLUMETRICS', 'anisotropy'], 0, 0.9, 0.01),
        { kind: 'heading', label: 'VIGNETTE' },
        t('on', ['VIGNETTE', 'enabled'], vignette),
        r('strength', ['VIGNETTE', 'strength'], 0, 1, 0.01, vignette),
        r('start', ['VIGNETTE', 'start'], 0, 99, 1, vignette),
        c('color', ['VIGNETTE', 'color'], vignette),
      ],
    },
  ];
}

/** F3 sections for the UI tab: what the HUD shows, the hotbar, and the pause menu. */
export function uiSections(): Section[] {
  return [
    {
      id: 'hud',
      title: 'HUD',
      items: [
        t('frame', ['HUD', 'frame']),
        t('rec', ['HUD', 'rec']),
        t('camera label', ['HUD', 'cam']),
        t('clock', ['HUD', 'clock']),
        t('performance', ['HUD', 'perf']),
        t('performance: gpu', ['HUD', 'perfGpu']),
        { kind: 'heading', label: 'HOTBAR' },
        r('size', ['HUD', 'slotSize'], 16, 60, 1),
        r('gap', ['HUD', 'slotGap'], 0, 40, 1),
        r('roundness', ['HUD', 'slotRoundness'], 0, 1, 0.05),
        c('border', ['HUD', 'slotBorder']),
        c('background', ['HUD', 'slotFill']),
        r('background: opacity', ['HUD', 'slotFillOpacity'], 0, 1, 0.05),
        c('selected: border', ['HUD', 'selectedBorder']),
        c('selected: background', ['HUD', 'selectedFill']),
        r('selected: opacity', ['HUD', 'selectedFillOpacity'], 0, 1, 0.05),
      ],
    },
    {
      id: 'pause',
      title: 'Pause menu',
      items: [
        c('color', ['PAUSE_MENU', 'color']),
        r('opacity', ['PAUSE_MENU', 'opacity'], 0, 1, 0.05),
        r('debug: opacity', ['PAUSE_MENU', 'debugOpacity'], 0, 1, 0.05),
        t('controls', ['PAUSE_MENU', 'controls']),
      ],
    },
  ];
}
