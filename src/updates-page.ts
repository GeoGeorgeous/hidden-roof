import { action, button, div, el } from './menu-ui';
import type { PauseMenu } from './pause-menu';
import { newestFirst, parseRelease, releaseDay, splitLinks } from './release-notes';
import { VERSION } from './version';

// The Updates popup of the ESC menu: the release notes, newest first, with
// their dates. They're bundled from docs/releases/<tag>.md (never fetched);
// each release's picture is public/updates/<tag>.webp (the CSP takes images
// from the game's own site only); a patch may have none. The site has them as
// a page too (updates-html.ts).

const RELEASES = 'https://github.com/GeoGeorgeous/hidden-roof/releases';

const notes = Object.entries(import.meta.glob<string>('../docs/releases/v*.md', { query: '?raw', import: 'default', eager: true }))
  .map(([path, md]) => parseRelease(path.replace(/^.*\/|\.md$/g, ''), md))
  .sort(newestFirst);

/** A line of a note with its [text](url) links as anchors; a new tab, so the game and its paint stay. */
function rich(tag: 'div' | 'span', className: string, text: string) {
  const e = el(tag, className);
  text.split('\n').forEach((line, i) => {
    if (i) e.append(el('br'));
    // **bold** as the note writes it: odd parts are bold.
    line.split(/\*\*(.+?)\*\*/).forEach((part, k) => {
      if (part) (k % 2 ? e.appendChild(el('b')) : e).append(...links(part));
    });
  });
  return e;
}

/** Text with its [text](url) links as anchors in a new tab. */
const links = (text: string) => splitLinks(text).map((p) => (typeof p === 'string' ? p : Object.assign(el('a', '', p.text), { href: p.href, target: '_blank', rel: 'noopener' })));

export function updatesPage(menu: PauseMenu) {
  const head = div('updates-head');
  head.append(div('popup-title', 'updates'), div('on', `You’re on ${VERSION.replace(/^v/, '')}`));
  const rail = div('rail');
  const pane = div('pane');
  const main = div('updates-main');
  main.append(rail, pane);
  const foot = div('updates-foot');
  foot.append(
    Object.assign(el('a', '', 'All releases on GitHub ↗'), { href: RELEASES, target: '_blank', rel: 'noopener' }),
    action('Close', () => menu.openPage(null), { primary: true, key: 'ESC' }),
  );
  const box = div('popup updates');
  box.append(head, main, foot);
  const root = div('page popup-page');
  root.append(box);
  const tabs = notes.map((r, i) => {
    const b = button('', () => show(i), 'ver');
    b.append(el('b', '', r.tag.replace(/^v/, '')), el('span', '', i ? '' : 'Latest'));
    rail.append(b);
    return b;
  });
  const show = (i: number) => {
    const r = notes[i];
    tabs.forEach((b, k) => b.classList.toggle('on', k === i));
    const shot = div('shot');
    shot.append(Object.assign(el('img'), { src: `${import.meta.env.BASE_URL}updates/${r.tag}.webp`, alt: '', loading: 'lazy' }));
    const items = div('items');
    for (const it of r.items) {
      const box = div('item-note');
      box.append(div('item-title', it.title));
      // Text over a list is its lead, brighter than the list; a heading's text alone (older notes) stays as it was.
      if (it.text) box.append(rich('div', it.list.length ? 'item-text lead' : 'item-text', it.text));
      if (it.list.length) {
        const list = div('terms');
        for (const [term, desc] of it.list) {
          const row = div('term-line');
          if (term) row.append(el('b', '', term));
          row.append(rich('span', '', desc));
          list.append(row);
        }
        box.append(list);
      }
      items.append(box);
    }
    const title = div('release', `Hidden Roof ${r.tag.replace(/^v/, '')}`);
    if (r.date) title.append(el('span', '', releaseDay(r.date)));
    pane.replaceChildren(title, rich('div', 'intro', r.intro), ...(__PICTURES__.includes(r.tag) ? [shot] : []), items);
    pane.scrollTop = 0;
  };
  menu.addPage('updates', root, () => show(0));
}
