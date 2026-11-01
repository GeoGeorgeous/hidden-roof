import { msg } from './messages';
import './other-tab.css';
import city from './other-tab.webp';
import { el } from './menu-ui';

// The screen of a tab that doesn't run the game because another does (one-tab.ts): the title over a still
// of the title view (other-tab.webp, no WebGL), and what is going on.

export function otherTab() {
  const root = el('div', 'small again');
  const image = el('img');
  image.src = city;
  image.alt = '';
  const body = el('div', 'small-body');
  const text = el('div', 'small-text');
  text.append(el('p', 'lead', msg('menu.otherTabTitle')), el('p', '', msg('menu.otherTabText')));
  body.append(el('div', 'small-gap'), el('b', 'small-title', 'Hidden Roof'), text, el('div', 'small-gap'));
  root.append(image, body);
  document.body.append(root);
}
