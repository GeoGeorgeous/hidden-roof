import { CAP_ORDER, CAPS, PICKUP, TAG_FONTS, type TagFont } from '../config';
import { defaultOf } from './defaults';
import { c, getValue, gray, live, r, setValue, t, type Item, type Section } from './tuning';

// F3 panel contents for items (tuning.ts has the helpers): the pickups in the
// world, and the tool models they, the first-person view, the figure's hand
// and the hotbar icons are all built from (tools/shapes.ts).

/** Every kind's world pickup (PICKUP.models): one heading each, the same rows for each. */
function pickupItems(): Item[] {
  return (Object.keys(PICKUP.models) as (keyof typeof PICKUP.models)[]).flatMap((k) => {
    const at = (label: string, key: 'offset' | 'rotation', i: number, max: number, step: number) =>
      r(label, ['PICKUP', 'models', k, key, String(i)], -max, max, step);
    return [
      { kind: 'heading', label: k.toUpperCase() } as Item,
      r('size', ['PICKUP', 'models', k, 'size'], 0.2, 6, 0.05),
      at('right', 'offset', 0, 0.5, 0.01),
      at('up', 'offset', 1, 0.5, 0.01),
      at('forward', 'offset', 2, 0.5, 0.01),
      at('tilt', 'rotation', 0, 3.14, 0.01),
      at('turn', 'rotation', 1, 3.14, 0.01),
      at('lean', 'rotation', 2, 3.14, 0.01),
    ];
  });
}

/** A tag font (TAG_FONTS) by name, as buttons: COPY and RESET take it like any value. */
function fontRow(label: string, path: string[]): Item {
  return {
    kind: 'choice',
    label,
    options: TAG_FONTS.map((f) => f.toUpperCase()),
    get: () => TAG_FONTS.indexOf(getValue(path) as TagFont),
    pick: (i) => setValue(path, TAG_FONTS[i]),
    copy: () => path.reduceRight<unknown>((v, k) => ({ [k]: v }), getValue(path)) as Record<string, unknown>,
    reset: () => setValue(path, defaultOf(path)),
  };
}

/** Pickups' tags (PICKUP.label): reach, each line's size and outline (and font, but katakana's), then where they sit on each ring shape. */
function tagItems(): Item[] {
  const lines = { caption: 'caption', captionKana: 'caption japanese', name: 'name', nameKana: 'name japanese' } as const;
  return [
    { kind: 'heading', label: 'TAGS' },
    r('reach', ['PICKUP', 'label', 'reach'], 0, 40, 0.5),
    ...(Object.keys(lines) as (keyof typeof lines)[]).flatMap((k) => [
      ...('font' in PICKUP.label[k] ? [fontRow(`${lines[k]}: font`, ['PICKUP', 'label', k, 'font'])] : []),
      r(`${lines[k]}: size`, ['PICKUP', 'label', k, 'size'], 0, 48, 1),
      r(`${lines[k]}: outline`, ['PICKUP', 'label', k, 'outline'], 0, 12, 0.5),
    ]),
    t('paint: on', ['PICKUP', 'label', 'color', 'on']),
    r('paint: up', ['PICKUP', 'label', 'color', 'up'], -0.5, 1.5, 0.01),
    ...(['cap', 'tool'] as const).flatMap((k) => [
      t(`${k}: on`, ['PICKUP', 'label', k, 'on']),
      r(`${k}: out`, ['PICKUP', 'label', k, 'at', '0'], -0.2, 1, 0.01),
      r(`${k}: up`, ['PICKUP', 'label', k, 'at', '1'], -0.5, 1, 0.01),
      r(`${k}: tilt`, ['PICKUP', 'label', k, 'tilt'], -90, 90, 1),
    ]),
  ];
}

/** F3 sections for items: pickups, then each tool's model and the caps. */
export function itemSections(): Section[] {
  const m = (label: string, path: string[], min: number, max: number, step: number) => r(label, ['MODELS', ...path], min, max, step, () => live.rebuildModels());
  return [
    {
      id: 'pickups',
      title: 'Pickups',
      items: [
        { kind: 'action', label: 'UNLOCK ALL', run: () => live.unlockAll() },
        r('reach', ['PICKUP', 'reach'], 0.2, 3, 0.05),
        r('reach: height', ['PICKUP', 'reachHeight'], 0.2, 4, 0.05),
        r('hover height', ['PICKUP', 'hover'], 0, 2, 0.05),
        r('spin speed', ['PICKUP', 'spin'], 0, 6, 0.1),
        r('bob height', ['PICKUP', 'bob'], 0, 0.5, 0.01),
        r('ring: size', ['PICKUP', 'ring', 'size'], 0.3, 3, 0.05),
        r('ring: opacity', ['PICKUP', 'ring', 'opacity'], 0, 1, 0.05),
        r('ring: paint color', ['PICKUP', 'ring', 'paint'], 0, 1, 0.05),
        gray('ring: cap color', ['PICKUP', 'ring', 'cap']),
        gray('ring: tool color', ['PICKUP', 'ring', 'tool']),
        r('ring: min size', ['PICKUP', 'ring', 'minSize'], 0, 0.1, 0.005),
        r('glow: size', ['PICKUP', 'glow', 'size'], 0, 4, 0.05),
        r('glow: floor size', ['PICKUP', 'glow', 'floor'], 0, 5, 0.05),
        r('glow: strength', ['PICKUP', 'glow', 'strength'], 0, 2, 0.05),
        r('glow: cover', ['PICKUP', 'glow', 'cover'], 0, 1, 0.05),
        r('glow: pulse', ['PICKUP', 'glow', 'pulse'], 0, 1, 0.05),
        r('glow: pulse rate', ['PICKUP', 'glow', 'pulseRate'], 0, 10, 0.1),
        ...tagItems(),
        ...pickupItems(),
      ],
    },
    {
      id: 'can',
      title: 'Can',
      items: [
        m('width', ['can', 'width'], 0.03, 0.12, 0.001),
        m('height', ['can', 'height'], 0.08, 0.25, 0.0005),
        m('label height', ['can', 'labelHeight'], 0, 0.2, 0.0005),
      ],
    },
    {
      id: 'cap-models',
      title: 'Caps',
      items: [
        m('width', ['cap', 'width'], 0.008, 0.04, 0.001),
        m('height', ['cap', 'height'], 0.004, 0.03, 0.001),
        ...CAP_ORDER.flatMap((cap) => [
          { kind: 'heading', label: CAPS[cap].name } as Item,
          c('color', ['CAPS', cap, 'color'], () => live.rebuildModels()),
          r('nozzle size', ['CAPS', cap, 'nozzle'], 0.002, 0.02, 0.001, () => live.rebuildModels()),
        ]),
      ],
    },
    {
      id: 'marker',
      title: 'Marker',
      items: [
        m('width', ['marker', 'width'], 0.01, 0.04, 0.001),
        m('length', ['marker', 'length'], 0.06, 0.25, 0.005),
        m('band length', ['marker', 'bandLength'], 0, 0.08, 0.002),
        m('nib size', ['marker', 'nibSize'], 0.003, 0.02, 0.001),
      ],
    },
    {
      id: 'ladder',
      title: 'Ladder',
      items: [
        m('height', ['ladder', 'height'], 0.2, 0.6, 0.01),
        m('width', ['ladder', 'width'], 0.05, 0.16, 0.005),
        m('tread spacing', ['ladder', 'treadSpacing'], 0.04, 0.2, 0.01),
      ],
    },
    {
      id: 'roller',
      title: 'Roller',
      items: [
        m('cover thickness', ['roller', 'coverThickness'], 0.03, 0.12, 0.005),
        m('frame thickness', ['roller', 'frameThickness'], 0.003, 0.02, 0.001),
        m('pole length', ['roller', 'poleLength'], 0.05, 0.5, 0.01),
      ],
    },
    {
      id: 'sponge',
      title: 'Sponge',
      items: [
        m('width', ['sponge', 'width'], 0.03, 0.25, 0.005),
        m('height', ['sponge', 'height'], 0.02, 0.2, 0.005),
        m('depth', ['sponge', 'depth'], 0.01, 0.1, 0.002),
        m('pad thickness', ['sponge', 'padThickness'], 0, 0.04, 0.001),
        m('pores', ['sponge', 'pores'], 0, 40, 1),
        m('pore size', ['sponge', 'poreSize'], 0.001, 0.02, 0.001),
      ],
    },
  ];
}
