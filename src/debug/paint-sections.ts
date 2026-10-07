import { CAP_ORDER, CAPS } from '../config';
import { c, live, r, t, type Item, type Section } from './tuning';

// F3 panel contents for painting (tuning.ts has the helpers): what each tool
// does, the caps, paint runs, pressure, how strokes are stamped, the cursor
// (each tool's width and crosshair), and the sponge's model.

/** One heading per cap, its own items under each. */
const perCap = (items: (cap: (typeof CAP_ORDER)[number]) => Item[]): Item[] =>
  CAP_ORDER.flatMap((cap) => [{ kind: 'heading', label: CAPS[cap].name } as Item, ...items(cap)]);

/** A wheel-sized tool's width and crosshair (wheel-size.ts), the same rows for each. */
function cursorItems(tool: 'MARKER' | 'ROLLER' | 'SPONGE', max: number, step: number, perMeter: number): Item[] {
  const sizes = () => live.applyToolSizes();
  return [
    { kind: 'heading', label: tool },
    r('starting width', [tool, 'width'], 0, max, step, sizes),
    r('wheel: min', [tool, 'widthMin'], 0, max, step),
    r('wheel: max', [tool, 'widthMax'], 0, max, step),
    r('wheel: step', [tool, 'widthStep'], step, max / 4, step),
    r('crosshair', [tool, 'crosshair'], 0, 60, 1),
    r('crosshair growth', [tool, 'crosshairPerMeter'], 0, perMeter, 5),
  ];
}

/** How a tool's stamps fill a move (tools/stroke.ts), the same rows for each. */
function strokeItems(tool: 'MARKER' | 'ROLLER' | 'SPONGE'): Item[] {
  return [
    { kind: 'heading', label: tool },
    r('spacing', [tool, 'spacing'], 0.05, 2, 0.05),
    r('max stamps per frame', [tool, 'maxRays'], 1, 128, 1),
    r('held still rate', [tool, 'stillRate'], 1, 60, 1),
  ];
}

export function paintSections(): Section[] {
  return [
    {
      id: 'painting',
      title: 'Painting',
      items: [
        r('alpha steps', ['PAINT', 'alphaSteps'], 0, 12, 1),
        { kind: 'heading', label: 'CAN' },
        r('reach', ['SPRAY', 'reach'], 1, 8, 0.1),
        r('fades from', ['SPRAY', 'falloffStart'], 0, 8, 0.1),
        r('particle speed', ['SPRAY', 'particleSpeed'], 2, 40, 0.5),
        { kind: 'heading', label: 'MARKER' },
        r('reach', ['MARKER', 'reach'], 0.5, 4, 0.1),
        r('opacity', ['MARKER', 'strength'], 0.05, 1, 0.01),
        { kind: 'heading', label: 'ROLLER' },
        r('reach', ['ROLLER', 'reach'], 0.5, 5, 0.1),
        r('opacity', ['ROLLER', 'strength'], 0.05, 1, 0.01),
        r('press half-depth (m)', ['ROLLER', 'pressLength'], 0.01, 0.3, 0.01),
        r('light ends', ['ROLLER', 'edge'], 0, 0.5, 0.01),
        { kind: 'heading', label: 'SPONGE' },
        r('reach', ['SPONGE', 'reach'], 0.5, 4, 0.1),
        r('cleans per pass', ['SPONGE', 'strength'], 0.01, 1, 0.01),
        r('softness', ['SPONGE', 'softness'], 0, 1, 0.05),
        r('scrub circle', ['SPONGE', 'scrubSize'], 0, 0.05, 0.001),
        r('scrub speed', ['SPONGE', 'scrubSpeed'], 0, 12, 0.1),
      ],
    },
    {
      id: 'caps',
      title: 'Caps',
      items: perCap((cap) => [
        r('opacity', ['CAPS', cap, 'strength'], 0.02, 1, 0.01),
        r('dot radius', ['CAPS', cap, 'dotSize'], 0, 0.4, 0.002),
        r('edge softness', ['CAPS', cap, 'softness'], 0, 1, 0.05),
        r('particle rate', ['CAPS', cap, 'rate'], 50, 2000, 10),
        r('spread', ['CAPS', cap, 'coneAngle'], 0.005, 0.3, 0.005),
        c('cap color', ['CAPS', cap, 'color']),
      ]),
    },
    {
      id: 'runs',
      title: 'Paint runs',
      items: [
        t('runs', ['DRIPS', 'enabled']),
        r('excess before a run', ['DRIPS', 'excess'], 0.5, 10, 0.1),
        r('runs per m²', ['DRIPS', 'perSquareMeter'], 0, 200, 1),
        r('max at once', ['DRIPS', 'maxActive'], 0, 200, 1),
        r('min length', ['DRIPS', 'minLength'], 0.02, 1, 0.01),
        r('max length', ['DRIPS', 'maxLength'], 0.02, 1.5, 0.01),
        r('speed', ['DRIPS', 'speed'], 0.01, 1, 0.01),
        r('opacity', ['DRIPS', 'strength'], 0.1, 1, 0.05),
        { kind: 'heading', label: 'AMOUNT' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'drips'], 0, 40, 0.5)),
        r('marker', ['MARKER', 'drips'], 0, 40, 0.5),
        r('roller', ['ROLLER', 'drips'], 0, 40, 0.5),
      ],
    },
    {
      id: 'pressure',
      title: 'Pressure',
      items: [
        r('drain', ['PRESSURE', 'drainPerSecond'], 0, 0.3, 0.005),
        { kind: 'heading', label: 'DRAIN PER CAP' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'drain'], 0, 5, 0.05)),
        { kind: 'heading', label: 'SPUTTER + SHAKE' },
        r('thin below', ['PRESSURE', 'thinThreshold'], 0, 1, 0.01),
        r('sputter below', ['PRESSURE', 'sputterThreshold'], 0, 1, 0.01),
        r('flow at sputter', ['PRESSURE', 'minSteadyFlow'], 0, 1, 0.01),
        r('sputter duty', ['PRESSURE', 'sputterDuty'], 0, 1, 0.01),
        r('shake restore', ['PRESSURE', 'shakeRestore'], 0, 1, 0.01),
        r('shake duration', ['PRESSURE', 'shakeDuration'], 0.1, 2, 0.05),
      ],
    },
    {
      id: 'stroke',
      title: 'Stroke',
      items: [
        ...strokeItems('MARKER'),
        ...strokeItems('ROLLER'),
        ...strokeItems('SPONGE'),
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

/** The tools' models (the hand's pose and size are in Held). */
export function modelSections(): Section[] {
  const sponge = () => live.rebuildSponge();
  return [
    {
      id: 'sponge',
      title: 'Sponge',
      items: [
        r('width (m)', ['SPONGE', 'model', 'width'], 0.03, 0.25, 0.005, sponge),
        r('height (m)', ['SPONGE', 'model', 'height'], 0.02, 0.2, 0.005, sponge),
        r('depth (m)', ['SPONGE', 'model', 'depth'], 0.01, 0.1, 0.002, sponge),
        r('scouring pad (m)', ['SPONGE', 'model', 'padDepth'], 0, 0.04, 0.001, sponge),
        r('pores', ['SPONGE', 'model', 'pores'], 0, 40, 1, sponge),
        r('pore size (m)', ['SPONGE', 'model', 'poreSize'], 0.001, 0.02, 0.001, sponge),
        c('soft part', ['SPONGE', 'model', 'soft'], sponge),
        c('scouring pad', ['SPONGE', 'model', 'pad'], sponge),
      ],
    },
  ];
}
