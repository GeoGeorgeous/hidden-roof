// Release notes: docs/releases/<tag>.md, one per release, the one source for
// the Updates popup (updates-page.ts), the GitHub release (scripts/release-notes.mjs)
// and their test. Format and rules: docs/releases/AGENTS.md. A note is a
// frontmatter date, the intro, then - **heading** items with their text, and
// lists under some (- **term**: what it is, or plain - lines).

interface Item {
  title: string;
  text: string;
  /** Term and description; plain lines have no term. */
  list: [term: string, desc: string][];
}
export interface Release {
  tag: string;
  /** The release date, YYYY-MM-DD; '' when the note has none. */
  date: string;
  intro: string;
  items: Item[];
}

const FRONT = /^---\n([\s\S]*?)\n---\n/;

const plain = (s: string) => s.replace(/\*\*/g, '').trim();

/** The note without its frontmatter. */
export const body = (md: string) => md.replace(/\r\n/g, '\n').replace(FRONT, '');

export function parseRelease(tag: string, md: string): Release {
  const date = /^date:\s*(\S+)\s*$/m.exec(FRONT.exec(md.replace(/\r\n/g, '\n'))?.[1] ?? '')?.[1] ?? '';
  const release: Release = { tag, date, intro: '', items: [] };
  let item: Item | null = null;
  for (const line of body(md).split('\n')) {
    const t = line.trim();
    const bullet = /^-\s+(.*)$/.exec(t);
    if (!t) continue;
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
export const newestFirst = (a: Release, b: Release) => b.tag.localeCompare(a.tag, 'en', { numeric: true });

/** The GitHub release's notes: a # title, the intro, the picture at `pictureUrl`, then the items. */
export function githubNotes(tag: string, md: string, pictureUrl: string): string {
  const text = body(md).trim();
  const at = text.search(/^-/m);
  const intro = (at < 0 ? text : text.slice(0, at)).trim();
  const items = at < 0 ? '' : text.slice(at).trim();
  return `# Hidden Roof ${tag.replace(/^v/, '')}\n\n${intro}\n\n  <img width="1200" src="${pictureUrl}" />\n\n${items}\n`;
}
