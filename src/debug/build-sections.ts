import { live, r, t, c, when, type Section } from './tuning';

// F3 panel contents for build mode (tuning.ts has the helpers): its daylight
// (DAYLIGHT replaces those ATMOS values while building), editing and the picker.

/** F3 sections for the Build tab. */
export function buildSections(): Section[] {
  const apply = () => live.applyDaylight();
  const shade = () => live.syncBuildPicker();
  const d = (label: string, key: string, min: number, max: number, step: number) => r(label, ['DAYLIGHT', key], min, max, step, apply);
  return [
    {
      id: 'daylight',
      title: 'Daylight',
      items: when('build', [
        d('haze', 'fogDensity', 0, 0.05, 0.0005),
        d('clouds: base', 'cloudBase', 5, 600, 5),
        d('wetness', 'wetness', 0, 1, 0.01),
        t('rain', ['DAYLIGHT', 'rain'], apply),
        { kind: 'heading', label: 'SUN' },
        d('intensity', 'moon', 0, 6, 0.05),
        c('color', ['DAYLIGHT', 'moonColor'], apply),
        d('height', 'moonHeight', 0, 90, 0.1),
        d('heading', 'moonHeading', 0, 360, 0.1),
        { kind: 'heading', label: 'AMBIENT' },
        d('intensity', 'ambient', 0, 4, 0.05),
        c('sky color', ['DAYLIGHT', 'ambientSky'], apply),
        c('ground color', ['DAYLIGHT', 'ambientGround'], apply),
        { kind: 'heading', label: 'LIGHT PROPS' },
        d('brightness', 'practical', 0, 4, 0.05),
        d('glow brightness', 'emissiveBoost', 0, 6, 0.1),
      ]),
    },
    {
      id: 'editing',
      title: 'Editing',
      items: when('build', [
        r('reach', ['BUILD', 'reach'], 10, 300, 5),
        r('repeat: delay', ['BUILD', 'repeatDelay'], 0.05, 1, 0.05),
        r('repeat: interval', ['BUILD', 'repeatInterval'], 0.03, 1, 0.01),
        r('fly: speed', ['BUILD', 'flySpeed'], 1, 30, 0.5),
        r('fly: sprint speed', ['BUILD', 'flySprintSpeed'], 2, 60, 0.5),
      ]),
    },
    {
      id: 'picker',
      title: 'Picker',
      items: when('build', [
        r('wheel: size', ['BUILD', 'wheelScale'], 0.5, 4, 0.05, shade),
        r('column: size', ['BUILD', 'columnScale'], 0.5, 3, 0.05, shade),
        r('shade: width', ['BUILD', 'shadeWidth'], 100, 2000, 10, shade),
        r('shade: opacity', ['BUILD', 'shadeOpacity'], 0, 1, 0.01, shade),
        c('shade: color', ['BUILD', 'shadeColor'], shade),
      ]),
    },
  ];
}
