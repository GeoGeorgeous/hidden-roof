import { NET } from './config';

// One game tab per browser (boot.ts): two tabs would paint on two copies of the roof, join one session as two
// players and spend the GPU twice. The tab that runs the game holds a Web Lock for as long as the page lives
// (released by the browser when it closes or reloads); a tab that finds it held runs no game, so it loads none of it,
// and says so (other-tab.ts). A browser without Web Locks just runs the game, as before.

const LOCK = 'roofhiddenhaus.tab';

const wait = (seconds: number) => new Promise((done) => setTimeout(done, seconds * 1000));

/** The lock if it is free: true, and kept for the page's life; false if another tab holds it. */
function lock() {
  return new Promise<boolean>((done) => {
    navigator.locks
      .request(LOCK, { ifAvailable: true }, (held) => {
        done(!!held);
        return held ? new Promise<void>(() => {}) : undefined;
      })
      .catch(() => done(true));
  });
}

/** Runs `start` (the game) in this tab if it is the only one; else says the game is open in another. */
export async function oneTab(start: () => Promise<unknown>) {
  if (!navigator.locks) return start();
  for (let tries = 1; tries <= NET.tabRetries; tries++) {
    if (await lock()) return start();
    if (tries < NET.tabRetries) await wait(NET.tabRetryGap);
  }
  (await import('./other-tab')).otherTab();
}
