import { CAP_ORDER, CAPS } from '../config';
import { r, type Item, type Section } from './tuning';

// F3 panel contents for sound (tuning.ts has the helpers): the mix, the
// weather, the spray can's hiss (each cap's own), and props.

/** F3 sections for the Sound tab. */
export function soundSections(): Section[] {
  return [
    {
      id: 'mix',
      title: 'Mix',
      items: [
        r('master', ['AUDIO', 'masterGain'], 0, 1.5, 0.01),
        r('ambience', ['AUDIO', 'ambienceGain'], 0, 0.3, 0.005),
        r('footsteps', ['AUDIO', 'footstepGain'], 0, 1, 0.01),
      ],
    },
    {
      id: 'weather-sound',
      title: 'Weather',
      items: [
        { kind: 'heading', label: 'RAIN' },
        r('volume', ['AUDIO', 'rainGain'], 0, 0.5, 0.005),
        r('tone', ['AUDIO', 'rainTone'], 500, 9000, 50),
        { kind: 'heading', label: 'DROPS ON METAL' },
        r('volume', ['AUDIO', 'metalGain'], 0, 0.4, 0.005),
        r('rate', ['AUDIO', 'metalRate'], 0, 10, 0.1),
        r('reach', ['AUDIO', 'metalRange'], 1, 20, 0.5),
        { kind: 'heading', label: 'THUNDER' },
        r('volume', ['AUDIO', 'thunderGain'], 0, 1.5, 0.01),
        r('delay: min', ['THUNDER', 'minDelay'], 0, 5, 0.1),
        r('delay: max', ['THUNDER', 'maxDelay'], 0, 10, 0.1),
      ],
    },
    {
      id: 'spray-sound',
      title: 'Spray',
      items: [
        r('hiss', ['AUDIO', 'hissGain'], 0, 0.8, 0.01),
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
        r('volume', ['AUDIO', 'fanGain'], 0, 0.5, 0.005),
        r('reach', ['AUDIO', 'fanRange'], 1, 20, 0.5),
      ],
    },
  ];
}
