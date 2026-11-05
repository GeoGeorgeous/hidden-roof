import { CAP_ORDER, CAPS } from '../config';
import { r, t, type Hooks, type Item, type Section } from './tuning';

// F3 panel contents for sound (tuning.ts has the helpers): the mix, the
// weather, the spray can's hiss (each cap's own), and props.

/** F3 sections for the Sound tab. */
export function soundSections(h: Hooks): Section[] {
  return [
    {
      id: 'mix',
      title: 'Mix',
      items: [
        r('master', ['AUDIO', 'masterGain'], 0, 1.5, 0.01),
        r('ambience', ['AUDIO', 'ambienceGain'], 0, 0.3, 0.001),
        r('footsteps', ['AUDIO', 'footstepGain'], 0, 1, 0.01),
      ],
    },
    {
      id: 'weather-sound',
      title: 'Weather',
      items: [
        { kind: 'heading', label: 'RAIN' },
        r('volume', ['AUDIO', 'rainGain'], 0, 0.5, 0.001),
        { kind: 'heading', label: 'STORM' },
        r('volume', ['AUDIO', 'stormGain'], 0, 1.5, 0.001),
        { kind: 'heading', label: 'THUNDER' },
        r('volume', ['AUDIO', 'thunderGain'], 0, 1.5, 0.01),
        r('delay: min', ['THUNDER', 'minDelay'], 0, 5, 0.1),
        r('delay: max', ['THUNDER', 'maxDelay'], 0, 10, 0.1),
      ],
    },
    {
      id: 'indoors-sound',
      title: 'Indoors',
      items: [
        t('mark rooms', ['INDOOR_VIEW', 'mark']),
        t('show rooms', ['INDOOR_VIEW', 'show']),
        r('brush', ['INDOOR_VIEW', 'brush'], 1, 9, 2),
        { kind: 'readout', label: 'marked', get: () => h.interiorCount() },
        { kind: 'action', label: 'SAVE LEVEL', run: () => h.saveLevel() },
        r('rain', ['AUDIO', 'indoorRainGain'], 0, 0.5, 0.001),
        r('city left', ['AUDIO', 'indoorCity'], 0, 1, 0.05),
        r('city tone', ['AUDIO', 'indoorTone'], 200, 8000, 50),
        r('change', ['AUDIO', 'indoorFade'], 0.05, 2, 0.05),
      ],
    },
    {
      id: 'spray-sound',
      title: 'Spray',
      items: [
        r('hiss', ['AUDIO', 'hissGain'], 0, 0.8, 0.001),
        r('opacity: none', ['HISS', 'opacityLow'], 0, 2, 0.05),
        r('opacity: full', ['HISS', 'opacityHigh'], 0, 2, 0.05),
        r('wall: close', ['HISS', 'near'], 0, 2, 0.05),
        r('wall: none', ['HISS', 'far'], 0, 2, 0.05),
        r('hand moving', ['HISS', 'moving'], 0, 2, 0.05),
        ...CAP_ORDER.flatMap((cap) => [
          { kind: 'heading', label: CAPS[cap].name } as Item,
          r('volume', ['CAPS', cap, 'hissGain'], 0, 2, 0.05),
          r('tone', ['CAPS', cap, 'hissTone'], 0, 1, 0.05),
        ]),
      ],
    },
    {
      id: 'props-sound',
      title: 'Props',
      items: [
        { kind: 'heading', label: 'AC FANS' },
        r('volume', ['AUDIO', 'fanGain'], 0, 0.5, 0.001),
        r('reach', ['AUDIO', 'fanRange'], 1, 20, 0.5),
      ],
    },
  ];
}
