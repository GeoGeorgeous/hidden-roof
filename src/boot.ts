// The page's entry: the game (main.ts) where it can be played; elsewhere the
// page about the game (index.html's <main class="about">) stays, all that a
// phone, a small window or a crawler gets: a window smaller than
// RENDER.minViewport, or a device with no mouse to lock (a phone, a tablet
// without one). The game is imported only once chosen, so a phone loads none of
// it: no three.js, level, textures, audio or WebSocket. ?force=1 loads the game
// anyway (the tests' small windows). index.html's inline script decides the same
// before the first paint (html.game, which hides the page): change both
// together; this sets the class too, should that script have been blocked. The
// game starts in one tab only (one-tab.ts). On the page, Play now appears once
// the window grows big enough; the game made small covers itself (small-window.ts).
// Each load says what it came to, for the site's traffic (mark).

const force = new URLSearchParams(location.search).has('force');
const root = document.documentElement;

/** A mouse to lock: not a phone, nor a tablet without one. */
function pointer() {
  return !matchMedia('(pointer: coarse) and (hover: none)').matches && 'requestPointerLock' in Element.prototype;
}

/** The game can be played here: a pointer to lock, and a window big enough. */
function playable() {
  return pointer() && innerWidth >= __MIN_VIEWPORT__.w && innerHeight >= __MIN_VIEWPORT__.h;
}

/** The page about the game shows: its hero's loop plays once the page and its fonts have loaded, as nothing else may wait for the page's heaviest file, unless the player asked for less motion or less data. */
function heroLoop() {
  const video = document.querySelector<HTMLVideoElement>('.about .hero-video');
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (!video || saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Upright (a phone), the loop's middle cut upright: as the poster (boot.css),
  // swapped when the window turns (a phone rotated, a desktop window dragged narrow).
  const upright = matchMedia('(orientation: portrait)');
  const load = () => {
    video.src = upright.matches ? '/about/roof-portrait.mp4' : '/about/roof.mp4';
    video.play().catch(() => {});
  };
  const start = () =>
    document.fonts.ready.then(() => {
      upright.addEventListener('change', load);
      load();
    });
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}

/** What this load came to, for the site's traffic (server/traffic-count.ts): a request for a static file, in Caddy's log whether or not the game's server is up. Nothing is kept on the device; ?force isn't a visitor. */
function mark(...marks: string[]) {
  if (force) return;
  fetch(`/mark.txt?${marks.map((m) => `m=${m}`).join('&')}`, { cache: 'no-store', keepalive: true }).catch(() => {});
}

/** This script came from the browser's cache: nothing crossed the network. Unknown is no. */
const fromCache = () => (performance.getEntriesByName(import.meta.url)[0] as PerformanceResourceTiming | undefined)?.transferSize === 0;

/** The page shows for want of room, not of WebGL: Play now appears once the window is big enough, with a mouse (a reload, as html.game is decided before the first paint). */
function watchRoom() {
  const play = document.querySelector<HTMLElement>('.about .play-now');
  if (!play) return;
  let timer = 0;
  addEventListener('resize', () => {
    timer ||= window.setTimeout(() => {
      timer = 0;
      play.hidden = !playable();
    }, __BOOT_TIMES__.check);
  });
}

/** Send the link to yourself: the share sheet where there is one (phones), else the clipboard. */
function sendLink() {
  const button = document.querySelector<HTMLButtonElement>('.about .send');
  if (!button) return;
  const label = button.textContent;
  const url = `${location.origin}/`;
  let timer = 0;
  const copied = () => {
    button.textContent = 'Link copied: paste it on your computer';
    clearTimeout(timer);
    timer = window.setTimeout(() => (button.textContent = label), __BOOT_TIMES__.copied);
  };
  button.addEventListener('click', () => {
    const sent = navigator.share ? navigator.share({ title: 'Hidden Roof', url }) : (navigator.clipboard?.writeText(url).then(copied) ?? Promise.reject());
    sent.catch(() => {});
  });
  button.hidden = false;
}

/** The game didn't start: the page about the game in its place, saying why. */
function failed() {
  const webgl = !!document.createElement('canvas').getContext('webgl2');
  mark(webgl ? 'loadFailed' : 'noWebgl');
  root.classList.remove('game');
  const note = document.querySelector<HTMLElement>('.about .failed');
  if (!note) return;
  const [head, how] = webgl
    ? ["The game didn't load", 'Check your connection, then reload the page.']
    : ['The game needs WebGL2, and this browser has it turned off', "Most often it's hardware acceleration: turn it on in the browser's settings, restart the browser, and reload this page."];
  note.querySelector('.failed-head')!.textContent = head;
  note.querySelector('.failed-how')!.textContent = how;
  note.hidden = false;
  heroLoop();
}

// Fails when a file of the game doesn't load, or the game can't start (no WebGL: three.js throws).
sendLink();
const play = force || playable();
mark(play ? 'game' : pointer() ? 'smallWindow' : 'noMouse', ...(fromCache() ? ['cached'] : []));
if (play) {
  root.classList.add('game');
  import('./one-tab').then((t) => t.oneTab(() => import('./main'))).catch(failed);
} else {
  // How to start playing: Make the window bigger where only the room is missing, else Play on a computer.
  root.classList.toggle('needs-room', pointer());
  heroLoop();
  watchRoom();
}
