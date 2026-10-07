import { CAP_ORDER, CAPS, PICKUP } from '../config';
import { c, live, r, type Item, type Section } from './tuning';

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

/** F3 sections for items: pickups, then each tool's model and the caps. */
export function itemSections(): Section[] {
  const m = (label: string, path: string[], min: number, max: number, step: number) => r(label, ['MODELS', ...path], min, max, step, live.rebuildModels);
  return [
    {
      id: 'pickups',
      title: 'Pickups',
      items: [
        r('reach', ['PICKUP', 'reach'], 0.2, 3, 0.05),
        r('hover height', ['PICKUP', 'hover'], 0, 2, 0.05),
        r('spin speed', ['PICKUP', 'spin'], 0, 6, 0.1),
        r('bob height', ['PICKUP', 'bob'], 0, 0.5, 0.01),
        r('ring: size', ['PICKUP', 'ring', 'size'], 0.3, 3, 0.05),
        r('ring: opacity', ['PICKUP', 'ring', 'opacity'], 0, 1, 0.05),
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
          c('color', ['CAPS', cap, 'color'], live.rebuildModels),
          r('nozzle size', ['CAPS', cap, 'nozzle'], 0.002, 0.02, 0.001, live.rebuildModels),
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
