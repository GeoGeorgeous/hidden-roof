import { msg } from './messages';
import './small-screen.css';
import city from './small-screen.webp';
import { el } from './menu-ui';

// The screen of a tab that doesn't run the game because another does (one-tab.ts), in screen 10's look
// (small-screen.ts): the title over the still of the city, and what is going on.

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
