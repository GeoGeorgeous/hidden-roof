import { RENDER } from './config';

// The loading screen (index.html): up from the first paint while the level is
// built, lit and painted (main.ts), each step named on it. The steps block,
// so it's plain markup with nothing to animate, and nothing on it to click.
// It goes once RENDER.loadFrames frames are drawn: the first compiles and
// uploads what the level needs, the next settle what waited on it.

let screen = document.querySelector<HTMLElement>('.loading');
let drawn = 0;

/** Names the next step; resolves once that is on screen. */
export function loadStep(text: string) {
  screen!.querySelector('span')!.textContent = text;
  return new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
}

export function loadFailed() {
  if (screen) screen.querySelector('span')!.textContent = "THE LEVEL DIDN'T LOAD: RELOAD THE PAGE";
}

/** After each frame drawn: enough of them, and the game shows. */
export function frameDrawn() {
  if (!screen || ++drawn < RENDER.loadFrames) return;
  screen.remove();
  screen = null;
}
