import { CAP_ORDER, CAPS } from '../config';
import { c, r, t, type Hooks, type Item, type Section } from './tuning';

// F3 panel contents for painting (tuning.ts has the helpers): what each tool
// does (one vocabulary: reach, width, opacity, softness), the caps, paint
// runs, quality (smoothness against cost), the cursor (size keys'
// range and crosshair).

/** One heading per cap, its own items under each. */
const perCap = (items: (cap: (typeof CAP_ORDER)[number]) => Item[]): Item[] =>
  CAP_ORDER.flatMap((cap) => [{ kind: 'heading', label: CAPS[cap].name } as Item, ...items(cap)]);

/** A tool sized by the size keys: their range and its crosshair (size-range.ts), the same rows for each. */
function cursorItems(tool: 'MARKER' | 'ROLLER' | 'SPONGE', max: number, step: number, perMeter: number): Item[] {
  return [
    { kind: 'heading', label: tool },
    r('size keys: min', [tool, 'widthMin'], 0, max, step),
    r('size keys: max', [tool, 'widthMax'], 0, max, step),
    r('size keys: step', [tool, 'widthStep'], step, max / 4, step),
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
export function paintSections(h: Hooks): Section[] {
  const sizes = () => h.applyToolSizes();
  return [
    {
      id: 'painting',
      title: 'Painting',
      items: [
        { kind: 'heading', label: 'CAN' },
        r('reach', ['SPRAY', 'reach'], 1, 8, 0.1),
        r('spray speed', ['SPRAY', 'particleSpeed'], 2, 40, 0.5),
        r('shake time', ['SPRAY', 'shakeDuration'], 0.1, 2, 0.05),
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
      id: 'brush',
      title: 'Brush',
      items: [
        r('opacity', ['BRUSH', 'opacity'], 0.05, 1, 0.01),
        r('opacity: least', ['BRUSH', 'opacityMin'], 0.01, 0.5, 0.01),
        r('opacity: most', ['BRUSH', 'opacityMax'], 0.5, 1, 0.01),
        r('opacity: step', ['BRUSH', 'opacityStep'], 0.01, 0.5, 0.01),
        r('streamline', ['BRUSH', 'streamline'], 0, 0.1, 0.005),
        r('held: rate', ['BRUSH', 'buildRate'], 0, 200, 1),
        r('held: opacity', ['BRUSH', 'buildAmount'], 0, 1, 0.05),
        { kind: 'heading', label: 'HAND SPEED' },
        r('from', ['BRUSH', 'speedRef'], 0.2, 10, 0.1),
        r('thinning', ['BRUSH', 'speedFade'], 0, 1, 0.05),
        r('widening', ['BRUSH', 'speedWiden'], 0, 2, 0.05),
        r('softening', ['BRUSH', 'speedSoft'], 0, 1, 0.05),
        r('follow', ['BRUSH', 'speedFollow'], 1, 60, 1),
        { kind: 'heading', label: 'DISTANCE' },
        r('close range', ['BRUSH', 'gap'], 0, 2, 0.05),
        r('nearest', ['BRUSH', 'minDistance'], 0.01, 0.5, 0.01),
        r('close until', ['BRUSH', 'closeAt'], 0, 1, 0.05),
        r('far from', ['BRUSH', 'farAt'], 0.5, 4, 0.1),
        r('size: close', ['BRUSH', 'closeSize'], 0.1, 2, 0.05),
        r('size: far', ['BRUSH', 'farSize'], 0.5, 4, 0.05),
        r('opacity: close', ['BRUSH', 'closeFlow'], 0.5, 4, 0.05),
        r('softness: close', ['BRUSH', 'closeSoft'], 0, 1, 0.05),
        r('softness: far', ['BRUSH', 'farSoft'], 0, 1, 0.05),
        r('softness: cap at par', ['BRUSH', 'softnessRef'], 0.05, 1, 0.05),
        r('spread share', ['BRUSH', 'coneShare'], 0, 1, 0.05),
        r('fade start', ['BRUSH', 'fadeStart'], 0, 0.9, 0.05),
        r('fade: min', ['BRUSH', 'fadeMin'], 0, 1, 0.05),
        { kind: 'heading', label: 'SLANT' },
        r('from', ['BRUSH', 'slantFrom'], 1, 2, 0.01),
        r('most', ['BRUSH', 'slantMax'], 1, 8, 0.1),
        r('tail', ['BRUSH', 'slantTail'], 0, 1, 0.05),
      ],
    },
    {
      id: 'caps',
      title: 'Caps',
      items: perCap((cap) => [
        r('dot size', ['CAPS', cap, 'dotSize'], 0, 0.4, 0.002),
        r('softness', ['CAPS', cap, 'softness'], 0, 1, 0.05),
        r('spread', ['CAPS', cap, 'spread'], 0, 0.6, 0.001),
        r('density', ['CAPS', cap, 'rate'], 50, 2000, 10),
        ...(CAPS[cap].nib ? [r('nib: stretch', ['CAPS', cap, 'nib', 'stretch'], 1, 8, 0.1), r('nib: angle', ['CAPS', cap, 'nib', 'angle'], -90, 90, 5)] : []),
      ]),
    },
    {
      id: 'runs',
      title: 'Paint runs',
      items: [
        t('on', ['DRIPS', 'enabled']),
        r('build-up needed', ['DRIPS', 'excess'], 0.5, 10, 0.1),
        r('drying time', ['DRIPS', 'dryTime'], 0.1, 20, 0.1),
        r('length: min', ['DRIPS', 'minLength'], 0.02, 1, 0.01),
        r('length: max', ['DRIPS', 'maxLength'], 0.02, 1.5, 0.01),
        r('drip speed', ['DRIPS', 'speed'], 0.01, 1, 0.01),
        r('opacity', ['DRIPS', 'strength'], 0.1, 1, 0.05),
        r('max at once', ['DRIPS', 'maxActive'], 0, 200, 1),
        { kind: 'heading', label: 'FREQUENCY PER TOOL' },
        ...CAP_ORDER.map((cap) => r(`${CAPS[cap].name.toLowerCase()} cap`, ['CAPS', cap, 'drips'], 0, 400, 1)),
        r('marker', ['MARKER', 'drips'], 0, 400, 1),
        r('roller', ['ROLLER', 'drips'], 0, 400, 1),
        // Debug views of wet paint and of runs: what they show, not how paint behaves.
        { kind: 'heading', label: 'VIEWS' },
        { kind: 'readout', label: 'most build-up', get: () => h.wetBuildUp() },
        t('wet view', ['WET_VIEW', 'enabled']),
        r('wet view: size', ['WET_VIEW', 'size'], 1, 12, 0.5),
        c('wet view: just wet', ['WET_VIEW', 'cool']),
        c('wet view: may run', ['WET_VIEW', 'color']),
        r('wet view: opacity', ['WET_VIEW', 'minOpacity'], 0, 1, 0.05),
        t('runs view', ['RUNS_VIEW', 'enabled']),
        r('runs view: size', ['RUNS_VIEW', 'size'], 1, 12, 0.5),
        c('runs view: color', ['RUNS_VIEW', 'color']),
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
        { kind: 'heading', label: 'CAN' },
        r('spacing', ['BRUSH', 'spacing'], 0.02, 0.5, 0.01),
        r('spacing: min', ['BRUSH', 'minSpacing'], 0.001, 0.02, 0.0002),
        r('max dabs / frame', ['BRUSH', 'maxDabs'], 8, 400, 1),
        r('new stroke jump', ['BRUSH', 'maxJump'], 0.5, 6, 0.1),
        r('particles\' wall: time', ['SPRAY', 'wall', 'reuse'], 0, 1, 0.05),
        r('particles\' wall: move', ['SPRAY', 'wall', 'move'], 0, 0.3, 0.01),
        r('particles\' wall: aim', ['SPRAY', 'wall', 'aim'], 0, 10, 0.5),
      ],
    },
    {
      id: 'cursor',
      title: 'Cursor',
      items: [
        r('no sized tool', ['CROSSHAIR', 'plain'], 0, 30, 1),
        { kind: 'heading', label: 'OPACITY ARC' },
        r('flow: time', ['CROSSHAIR', 'arc', 'flowMs'], 0, 1000, 10),
        r('flow: bounce', ['CROSSHAIR', 'arc', 'bounce'], 1, 3, 0.05),
        r('line', ['CROSSHAIR', 'arc', 'line'], 0.5, 4, 0.1),
        r('line: peak', ['CROSSHAIR', 'arc', 'peak'], 0.5, 8, 0.1),
        r('line: time', ['CROSSHAIR', 'arc', 'lineMs'], 0, 1000, 10),
        ...cursorItems('MARKER', 0.4, 0.002, 1000),
        ...cursorItems('ROLLER', 1.2, 0.02, 200),
        ...cursorItems('SPONGE', 0.8, 0.01, 500),
      ],
    },
  ];
}
