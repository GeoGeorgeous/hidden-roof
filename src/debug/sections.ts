import { buildSections } from './build-sections';
import { itemSections } from './item-sections';
import { paintSections } from './paint-sections';
import { playSections } from './play-sections';
import { renderSections, uiSections } from './render-sections';
import { soundSections } from './sound-sections';
import { splitSections, type Hooks } from './tuning';
import { worldSections } from './world-sections';

// Every section of the F3 panel, as panel.ts lays them out on its tabs. No
// DOM: scripts/f3-paths.test.mjs checks their config paths in Node.

export function allSections(h: Hooks) {
  return splitSections([...playSections(h), ...paintSections(h), ...renderSections(h), ...worldSections(h), ...soundSections(), ...uiSections(h), ...buildSections(h), ...itemSections(h)]);
}
