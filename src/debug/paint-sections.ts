import { CAP_ORDER, CAPS } from '../config';
import { live, r, t, type Item, type Section } from './tuning';

// F3 panel contents for painting (tuning.ts has the helpers): what each tool
// does (one vocabulary: reach, width, opacity, softness), the caps, paint
// runs, pressure, quality (smoothness against cost), the cursor (wheel range
// and crosshair).

/** One heading per cap, its own items under each. */
const perCap = (items: (cap: (typeof CAP_ORDER)[number]) => Item[]): Item[] =>
  CAP_ORDER.flatMap((cap) => [{ kind: 'heading', label: CAPS[cap].name } as Item, ...items(cap)]);

/** A wheel-sized tool's wheel range and crosshair (wheel-size.ts), the same rows for each. */
function cursorItems(tool: 'MARKER' | 'ROLLER' | 'SPONGE', max: number, step: number, perMeter: number): Item[] {
  return [
    { kind: 'heading', label: tool },
    r('wheel: min', [tool, 'widthMin'], 0, max, step),
    r('wheel: max', [tool, 'widthMax'], 0, max, step),
    r('wheel: step', [tool, 'widthStep'], step, max / 4, step),
    r('crosshair', [tool, 'crosshair'], 0, 60, 1),
    r('crosshair growth', [tool, 'crosshairPerMeter'], 0, perMeter, 5),
  ];
}

/** How a tool's stamps fill a move (tools/stroke.ts): smoothness against cost, the same rows for each. */
function qualityItems(tool: 'MARKER' | 'ROLLER' | 'SPONGE'): Item[] {
  return [
    { kind: 'heading', label: tool },
    r('spacing', [tool, 'spacing'], 0.05, 2, 0.05),
    r('max stamps / frame', [tool, 'maxRays'], 1, 128, 1),
    r('held-still rate', [tool, 'stillRate'], 1, 60, 1),
  ];
}

/** Each tool: reach, width, opacity, softness, then what only it has. */
export function paintSections(): Section[] {
  const sizes = () => live.applyToolSizes();
  return [
    {
      id: 'painting',
      title: 'Painting',
      items: [
        { kind: 'heading', label: 'CAN' },
        r('reach', ['SPRAY', 'reach'], 1, 8, 0.1),
        r('fade start', ['SPRAY', 'falloffStart'], 0, 8, 0.1),
        r('spray speed', ['SPRAY', 'particleSpeed'], 2, 40, 0.5),
        { kind: 'heading', label: 'MARKER' },
        r('reach', ['MARKER', 'reach'], 0.5, 4, 0.1),
        r('width', ['MARKER', 'width'], 0, 0.4, 0.002, sizes),
        r('opacity', ['MARKER', 'strength'], 0.05, 1, 0.01),
        { kind: 'heading', label: 'ROLLER' },
        r('reach', ['ROLLER', 'reach'], 0.5, 5, 0.1),
        r('width', ['ROLLER', 'width'], 0.1, 1.2, 0.02, sizes),
        r('opacity', ['ROLLER', 'strength'], 0.05, 1, 0.01),
        r('softness', ['ROLLER', 'softness'], 0, 0.5, 0.01),
        { kind: 'heading', label: 'SPONGE' },
        r('reach', ['SPONGE', 'reach'], 0.5, 4, 0.1),
        r('width', ['SPONGE', 'width'], 0.02, 0.8, 0.01, sizes),
        r('strength', ['SPONGE', 'strength'], 0.01, 1, 0.01),
        r('softness', ['SPONGE', 'softness'], 0, 1, 0.05),
      ],
    },
    {
      id: 'caps',
      title: 'Caps',
      items: perCap((cap) => [
        r('dot size', ['CAPS', cap, 'dotSize'], 0, 0.4, 0.002),
        r('opacity', ['CAPS', cap, 'strength'], 0.02, 1, 0.01),
        r('softness', ['CAPS', cap, 'softness'], 0, 1, 0.05),
        r('spread', ['CAPS', cap, 'spread'], 0.01, 0.6, 0.01),
        r('density', ['CAPS', cap, 'rate'], 50, 2000, 10),
      ]),
    },
    {
      id: 'runs',
      title: 'Paint runs',
      items: [
        t('on', ['DRIPS', 'enabled']),
        r('build-up needed', ['DRIPS', 'excess'], 0.5, 10, 0.1),
        r('length: min', ['DRIPS', 'minLength'], 0.02, 1, 0.01),
        r('length: max', ['DRIPS', 'maxLength'], 0.02, 1.5, 0.01),
        r('drip speed', ['DRIPS', 'speed'], 0.01, 1, 0.01),
        r('opacity', ['DRIPS', 'strength'], 0.1, 1, 0.05),
        r('max at once', ['DRIPS', 'maxActive'], 0, 200, 1),
        { kind: 'heading', label: 'FREQUENCY PER TOOL' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'drips'], 0, 400, 1)),
        r('marker', ['MARKER', 'drips'], 0, 400, 1),
        r('roller', ['ROLLER', 'drips'], 0, 400, 1),
      ],
    },
    {
      id: 'pressure',
      title: 'Pressure',
      items: [
        { kind: 'heading', label: 'DRAIN PER CAP' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'drain'], 0, 0.3, 0.005)),
        { kind: 'heading', label: 'SPUTTER' },
        r('thinning from', ['PRESSURE', 'thinThreshold'], 0, 1, 0.01),
        r('from', ['PRESSURE', 'sputterThreshold'], 0, 1, 0.01),
        r('flow', ['PRESSURE', 'minSteadyFlow'], 0, 1, 0.01),
        r('bursts', ['PRESSURE', 'sputterDuty'], 0, 1, 0.01),
        { kind: 'heading', label: 'SHAKE' },
        r('refill: press', ['PRESSURE', 'shakeTap'], 0, 0.3, 0.01),
        r('refill: per second', ['PRESSURE', 'shakeRate'], 0, 2, 0.05),
        r('time', ['PRESSURE', 'shakeDuration'], 0.1, 2, 0.05),
      ],
    },
    {
      id: 'quality',
      title: 'Quality',
      items: [
        ...qualityItems('MARKER'),
        ...qualityItems('ROLLER'),
        r('press length', ['ROLLER', 'pressLength'], 0.01, 0.3, 0.01),
        ...qualityItems('SPONGE'),
      ],
    },
    {
      id: 'cursor',
      title: 'Cursor',
      items: [
        r('no sized tool', ['CROSSHAIR', 'plain'], 0, 30, 1),
        { kind: 'heading', label: 'CAN' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'crosshair'], 2, 60, 1)),
        ...cursorItems('MARKER', 0.4, 0.002, 1000),
        ...cursorItems('ROLLER', 1.2, 0.02, 200),
        ...cursorItems('SPONGE', 0.8, 0.01, 500),
      ],
    },
  ];
}
