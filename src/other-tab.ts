import { msg } from './messages';
import './small-screen.css';
import city from './small-screen.webp';
import { el } from './menu-ui';

// The screen of a tab that doesn't run the game because another does (one-tab.ts), in screen 10's look
// (small-screen.ts): the title over the still of the city, what is going on, and PLAY HERE, which takes the game
// over from the other tab: `takeOver` asks it to let go and resolves once this tab holds the lock, then `start`
// (the game) loads under the loading screen, which was there all along.

export function otherTab(takeOver: () => Promise<void>, start: () => Promise<unknown>) {
  const root = el('div', 'small again');
  const image = el('img');
  image.src = city;
  image.alt = '';
  const body = el('div', 'small-body');
  const text = el('div', 'small-text');
  text.append(el('p', 'lead', msg('menu.otherTabTitle')), el('p', '', msg('menu.otherTabText')));
  const play = el('button', 'primary', msg('menu.playHere'));
  const buttons = el('div', 'small-buttons');
  buttons.append(play);
  body.append(el('div', 'small-gap'), el('b', 'small-title', 'Hidden Roof'), text, buttons, el('div', 'small-gap'));
  root.append(image, body);
  document.body.append(root);
  play.addEventListener('click', () => {
    play.disabled = true;
    void takeOver().then(() => (root.remove(), start()));
  });
}
