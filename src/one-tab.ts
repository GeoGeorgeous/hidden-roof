import { NET } from './config';

// One game tab per browser (boot.ts): two tabs would paint on two copies of the roof, join one session as two
// players and spend the GPU twice. The tab that runs the game holds a Web Lock for as long as the page lives
// (released by the browser when it closes or reloads); a tab that finds it held runs no game, so it loads none of it,
// and shows a screen (other-tab.ts) instead. PLAY HERE there asks the other tab, over a BroadcastChannel, to let go:
// it leaves its session (the game's part: onTakeover), frees the lock and reloads into that same screen. A browser
// without Web Locks or BroadcastChannel just runs the game, as before.

const LOCK = 'roofhiddenhaus.tab';
const CHANNEL = 'roofhiddenhaus.tab';
const TAKEOVER = 'takeover';

const wait = (seconds: number) => new Promise((done) => setTimeout(done, seconds * 1000));

let leave: () => void = () => {};
/** What the game does when another tab takes over, before this page reloads: leaves its session for good (main.ts). */
export function onTakeover(fn: () => void) {
  leave = fn;
}

/** Asks for the lock: granted, true, and kept until `release` is called (or the page goes); `wait` queues for it instead of giving up when it is held. */
function lock(queue: boolean) {
  let release = () => {};
  const granted = new Promise<boolean>((done) => {
    navigator.locks
      .request(LOCK, { ifAvailable: !queue }, (held) => {
        done(!!held);
        return held ? new Promise<void>((free) => (release = free)) : undefined;
      })
      .catch(() => done(true));
  });
  return { granted, release: () => release() };
}

/** Runs `start` (the game) in this tab if it is the only one; else shows the screen, and PLAY HERE runs it once the other has let go. */
export async function oneTab(start: () => Promise<unknown>) {
  if (!navigator.locks || typeof BroadcastChannel === 'undefined') return start();
  let mine = lock(false);
  for (let tries = 1; !(await mine.granted) && tries < NET.tabRetries; tries++) {
    await wait(NET.tabRetryGap);
    mine = lock(false);
  }
  if (await mine.granted) {
    hold(mine.release);
    return start();
  }
  const { otherTab } = await import('./other-tab');
  otherTab(async () => {
    new BroadcastChannel(CHANNEL).postMessage(TAKEOVER);
    const queued = lock(true);
    await queued.granted;
    hold(queued.release);
  }, start);
}

/** This tab runs the game: when another asks, it leaves its session, lets go of the lock and reloads (into the screen of a tab that doesn't run it). */
function hold(release: () => void) {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = async (e) => {
    if (e.data !== TAKEOVER) return;
    channel.close();
    try {
      leave();
    } catch (err) {
      console.error(err);
    }
    await wait(NET.tabLetGo);
    release();
    location.reload();
  };
}
