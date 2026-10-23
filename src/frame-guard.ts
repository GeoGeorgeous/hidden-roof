// A frame that throws (main.ts): the error is reported once, as an uncaught
// error would be (the console, the tests' page errors), and a dialogue asks for
// a reload, with the error to copy. Without it the game stands still, or throws
// every frame, with nothing on screen to say so. The frames go on: the
// session's check for a silent server is one of them (F1.4).

import { dialogueLayer } from './dialogue-view';
import { dialogueOf } from './messages';

let failed = false;

/** Runs one frame's work; the first exception is reported and shows the notice, later ones are dropped. */
export function guarded(step: (time: number) => void, time: number) {
  try {
    step(time);
  } catch (e) {
    if (failed) return;
    failed = true;
    reportError(e);
    showNotice(e);
  }
}

/** The error as text for the callout: Firefox's stack lacks the message line that Chrome's starts with. */
function describe(e: unknown) {
  if (!(e instanceof Error)) return String(e);
  const head = `${e.name}: ${e.message}`;
  return e.stack ? (e.stack.startsWith(head) ? e.stack : `${head}\n${e.stack}`) : head;
}

/** The "game crashed" dialogue, drawn here by itself: this is the frame loop, which updates the notify view, breaking. */
function showNotice(e: unknown) {
  // The cursor back, to copy the error and click the button.
  document.exitPointerLock();
  const reload = () => location.reload();
  const { dim, card } = dialogueLayer({ ...dialogueOf('clientError'), callout: describe(e) }, reload);
  const root = Object.assign(document.createElement('div'), { className: 'layer layer-dialogue crash on' });
  root.append(dim, card);
  document.body.append(root);
  // Enter presses the button, as on every dialogue, while the card is up.
  addEventListener('keydown', (ev) => root.isConnected && (ev.code === 'Enter' || ev.code === 'NumpadEnter') && reload(), true);
}
