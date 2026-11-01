import { RENDER } from './config';
import { el } from './menu-ui';
import { msg } from './messages';

// The game's window made smaller than RENDER.minViewport while playing (the
// page loaded big enough, boot.ts): a note over everything, the mouse let go
// (so the game pauses as on Esc), until the window is big enough again. Nothing
// reloads: the session and the paint stay. ?force=1 (the tests' small windows)
// never shows it.

export function smallWindow() {
  if (new URLSearchParams(location.search).has('force')) return;
  const { w, h } = RENDER.minViewport;
  const note = el('div', 'small-window');
  note.setAttribute('role', 'alert');
  note.hidden = true;
  note.append(el('b', '', msg('menu.smallWindow')), el('p', '', msg('menu.smallWindowText', { w, h })));
  document.body.append(note);
  let timer = 0;
  const check = () => {
    timer = 0;
    const small = innerWidth < w || innerHeight < h;
    if (small === !note.hidden) return;
    note.hidden = !small;
    if (small && document.pointerLockElement) document.exitPointerLock();
  };
  // Taken again behind the note (Enter on the pause screen): let go again.
  document.addEventListener('pointerlockchange', () => {
    if (!note.hidden && document.pointerLockElement) document.exitPointerLock();
  });
  // At most every minViewportCheck ms while the window is being dragged, and once after it stops.
  addEventListener('resize', () => {
    timer ||= window.setTimeout(check, RENDER.minViewportCheck);
  });
}
