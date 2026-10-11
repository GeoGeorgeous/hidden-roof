import { RENDER } from './config';

// The loading screen (index.html): up from the first paint while the level is
// built, lit and painted (main.ts), each step named on it. The steps block,
// so it's plain markup, and nothing on it to click. Each step's name fades
// in over the last (two stacked lines, one class swap: a CSS transition, no
// timers); a step that blocks just finishes the fade later.
// It goes once RENDER.loadFrames frames are drawn: the first compiles and
// uploads what the level needs, the next settle what waited on it.

let screen = document.querySelector<HTMLElement>('.loading');
let drawn = 0;

/** The hidden status line takes `text` and fades in over the shown one. */
function say(text: string) {
  const [a, b] = screen!.querySelectorAll('span');
  const next = a.classList.contains('on') ? b : a;
  next.textContent = text;
  a.classList.toggle('on', next === a);
  b.classList.toggle('on', next === b);
}

/** Names the next step; resolves once that is on screen (not waiting for the fade). */
export function loadStep(text: string) {
  say(text);
  return new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
}

export function loadFailed() {
  if (screen) say("The level didn't load: reload the page");
}

/**
 * The first frame under the screen is drawn from where the player stands, the
 * next from the title view: each sets up what it draws, so neither stalls later.
 */
export function drawsFromPlayer() {
  return !!screen && drawn === 0;
}

/** After each frame drawn: enough of them, and the game shows. */
export function frameDrawn() {
  if (!screen || ++drawn < RENDER.loadFrames) return;
  screen.remove();
  screen = null;
}
