import { action, button, div } from './menu-ui';
import type { PauseMenu } from './pause-menu';
import { VERSION } from './version';

// The Updates popup of the ESC menu: the release notes, newest first. They're
// the GitHub releases' notes, kept in docs/releases/<tag>.md and bundled with
// the game (never fetched); each release's picture is public/updates/<tag>.webp
// (the CSP takes images from the game's own site only). The notes are read as
// the releases write them: a # title, the intro, then - **heading** items with
// their text, and lists under some (- **term**: what it is, or plain - lines).

const RELEASES = 'https://github.com/GeoGeorgeous/hidden-roof/releases';

interface Item {
  title: string;
  text: string;
  /** Term and description; plain lines have no term. */
  list: [term: string, desc: string][];
}
interface Release {
  tag: string;
  intro: string;
  items: Item[];
}

const plain = (s: string) => s.replace(/\*\*/g, '').trim();

function parse(tag: string, md: string): Release {
  const release: Release = { tag, intro: '', items: [] };
  let item: Item | null = null;
  for (const line of md.split('\n')) {
    const t = line.trim();
    const bullet = /^-\s+(.*)$/.exec(t);
    if (!t || t.startsWith('#') || t.startsWith('<img')) continue;
    if (bullet && line.startsWith('-')) release.items.push((item = { title: plain(bullet[1]), text: '', list: [] }));
    else if (bullet && item) {
      const term = /^\*\*(.+?)\*\*:?\s*(.*)$/.exec(bullet[1]);
      item.list.push(term ? [term[1], term[2]] : ['', plain(bullet[1])]);
    } else if (item) item.text = `${item.text} ${plain(t)}`.trim();
    else release.intro = `${release.intro} ${plain(t)}`.trim();
  }
  return release;
}

/** v1.10.0 after v1.9.0. */
const newestFirst = (a: Release, b: Release) => b.tag.localeCompare(a.tag, 'en', { numeric: true });

const notes = Object.entries(import.meta.glob<string>('../docs/releases/v*.md', { query: '?raw', import: 'default', eager: true }))
  .map(([path, md]) => parse(path.replace(/^.*\/|\.md$/g, ''), md))
  .sort(newestFirst);

export function updatesPage(menu: PauseMenu) {
  const head = div('updates-head');
  head.append(div('popup-title', 'updates'), div('on', `You’re on ${VERSION.replace(/^v/, '')}`));
  const rail = div('rail');
  const pane = div('pane');
  const main = div('updates-main');
  main.append(rail, pane);
  const foot = div('updates-foot');
  foot.append(
    Object.assign(document.createElement('a'), { textContent: 'All releases on GitHub ↗', href: RELEASES, target: '_blank', rel: 'noopener' }),
    action('Close', () => menu.openPage(null), { primary: true, key: 'ESC' }),
  );
  const box = div('popup updates');
  box.append(head, main, foot);
  const root = div('page popup-page');
  root.append(box);
  const tabs = notes.map((r, i) => {
    const b = button('', () => show(i), 'ver');
    b.append(Object.assign(document.createElement('b'), { textContent: r.tag.replace(/^v/, '') }), Object.assign(document.createElement('span'), { textContent: i ? '' : 'Latest' }));
    rail.append(b);
    return b;
  });
  const show = (i: number) => {
    const r = notes[i];
    tabs.forEach((b, k) => b.classList.toggle('on', k === i));
    const shot = div('shot');
    shot.append(Object.assign(document.createElement('img'), { src: `${import.meta.env.BASE_URL}updates/${r.tag}.webp`, alt: '', loading: 'lazy' }));
    const items = div('items');
    for (const it of r.items) {
      const el = div('item-note');
      el.append(div('item-title', it.title));
      if (it.text) el.append(div('item-text', it.text));
      if (it.list.length) {
        const list = div('terms');
        for (const [term, desc] of it.list) {
          const line = div('term-line');
          if (term) line.append(Object.assign(document.createElement('b'), { textContent: term }));
          line.append(Object.assign(document.createElement('span'), { textContent: desc }));
          list.append(line);
        }
        el.append(list);
      }
      items.append(el);
    }
    pane.replaceChildren(div('release', `Hidden Roof ${r.tag.replace(/^v/, '')}`), div('intro', r.intro), shot, items);
    pane.scrollTop = 0;
  };
  menu.addPage('updates', root, () => show(0));
}
