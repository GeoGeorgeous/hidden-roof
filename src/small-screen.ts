import { msg } from './messages';
import './small-screen.css';
import { AUTHOR, DISCORD, PRIVACY, REPO, TERMS } from './links';
import city from './small-screen.webp';
import { VERSION } from './version';
import { el } from './menu-ui';

// Screen 10, in place of the game where it can't be played (boot.ts): the
// title over a still of the title view (small-screen.webp, no WebGL),
// what the game needs, and the page's link to send to a computer. Made wide
// enough (and with a mouse), it offers to load the game instead: a reload.

/** "Link copied" and its hint show this long (ms). */
const COPIED_MS = 2500;
const HINT = msg('menu.smallHint');

export function smallScreen(playable: () => boolean) {
  document.querySelector('.loading')?.remove();
  const root = el('div', 'small');
  root.innerHTML = `<img src="${city}" alt="">
<div class="small-body">
  <div class="small-gap"></div>
  <b class="small-title">Hidden Roof</b>
  <div class="small-text"><p class="lead">Paint feels better on a bigger screen.</p><p>Hidden Roof needs a keyboard, a mouse and a wide window. Open it on a computer, or make this window wider.</p></div>
  <div class="small-buttons">
    <p class="hint"></p>
    <button class="primary load" hidden>Load the game</button>
    <button class="primary copy">Copy link</button>
    <a class="outline" href="${DISCORD}" target="_blank" rel="noopener">Join the Discord</a>
  </div>
  <div class="small-gap"></div>
  <footer><span><a href="${REPO}" target="_blank" rel="noopener">GitHub</a><i>·</i>${VERSION}</span><span><a href="${TERMS}" target="_blank" rel="noopener">Terms</a><i>·</i><a href="${PRIVACY}" target="_blank" rel="noopener">Privacy</a></span><span>built by <a href="${AUTHOR}" target="_blank" rel="noopener">GeoGeorgeous</a></span></footer>
</div>`;
  document.body.append(root);
  const hint = root.querySelector<HTMLElement>('.hint')!;
  const copy = root.querySelector<HTMLButtonElement>('.copy')!;
  const load = root.querySelector<HTMLButtonElement>('.load')!;
  hint.textContent = HINT;

  let copied = 0;
  const done = () => {
    copy.textContent = msg('menu.linkCopied');
    hint.textContent = msg('menu.smallCopied');
    clearTimeout(copied);
    copied = window.setTimeout(() => ((copy.textContent = 'Copy link'), (hint.textContent = HINT)), COPIED_MS);
  };
  // The share sheet where there is one (phones), else the clipboard.
  copy.addEventListener('click', () => {
    const url = location.href;
    const sent = navigator.share ? navigator.share({ title: 'Hidden Roof', url }) : (navigator.clipboard?.writeText(url) ?? Promise.reject());
    sent.then(done, () => {});
  });

  load.addEventListener('click', () => location.reload());
  // In place of Copy link while the window is big enough.
  const fits = () => {
    const ok = playable();
    if (ok === !load.hidden) return;
    load.hidden = !ok;
    copy.hidden = ok;
    hint.textContent = ok ? msg('menu.smallWide') : HINT;
  };
  addEventListener('resize', fits);
  fits();
}

