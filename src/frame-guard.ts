// A frame that throws (main.ts): the error is reported once, as an uncaught
// error would be (the console, the tests' page errors), and a notice asks for
// a reload. Without it the game stands still, or throws every frame, with
// nothing on screen to say so. The frames go on: the session's check for a
// silent server is one of them (F1.4).

let failed = false;

/** Runs one frame's work; the first exception is reported and shows the notice, later ones are dropped. */
export function guarded(step: (time: number) => void, time: number) {
  try {
    step(time);
  } catch (e) {
    if (failed) return;
    failed = true;
    reportError(e);
    showNotice();
  }
}

function showNotice() {
  // The cursor back, for the button.
  document.exitPointerLock();
  const root = Object.assign(document.createElement('div'), { className: 'frame-failed' });
  root.innerHTML = '<p>Something broke. Reload the page to go on.</p><button>Reload</button>';
  root.querySelector('button')!.onclick = () => location.reload();
  document.body.append(root);
}
