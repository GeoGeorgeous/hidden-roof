import { RENDER } from './config';
import { sayLoading } from './loading-line';

// The loading screen (index.html): up from the first paint while the level is
// built, lit and painted (main.ts), each step named on it. The steps block,
// so it's plain markup, and nothing on it to click. Each step's name fades
// in over the last (loading-line.ts: two stacked lines, one class swap, a CSS transition, no
// timers); a step that blocks just finishes the fade later.
// It goes once RENDER.loadFrames frames are drawn: the first compiles and
// uploads what the level needs, the next settle what waited on it.

let screen = document.querySelector<HTMLElement>('.loading');
let drawn = 0;

/** Names the next step; resolves once that is on screen (not waiting for the fade). */
export function loadStep(text: string) {
  if (screen) sayLoading(text);
  // A hidden tab is given no animation frames: it would wait for one until it is shown.
  return new Promise((done) => (document.hidden ? setTimeout(done) : requestAnimationFrame(() => setTimeout(done))));
}

export function loadFailed() {
  if (screen) sayLoading("The level didn't load: reload the page");
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
