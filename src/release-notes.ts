// Release notes: docs/releases/<tag>.md, one per release, the one source for
// the Updates popup (updates-page.ts), the GitHub release (scripts/release-notes.mjs)
// and their test. Format and rules: docs/releases/AGENTS.md. A note is a
// frontmatter date, the intro, then - **heading** items with their text, and
// lists under some (- **term**: what it is, or plain - lines). An item's text
// keeps its lines, each shown on its own line, and **bold** where it's written so. A link is
// markdown, [text](url): the game's own pages root-relative ([Terms](/terms.html)),
// other sites absolute.

import { AUTHOR, SITE } from './links.ts';

interface Item {
  title: string;
  text: string;
  /** Term and description; plain lines have no term. */
  list: [term: string, desc: string][];
}
interface Release {
  tag: string;
  /** The release date, YYYY-MM-DD; '' when the note has none. */
  date: string;
  intro: string;
  items: Item[];
}

/** The sites a note may link to besides the game's own pages (root-relative); the Updates page makes links of nothing else. */
const DISCORD_INVITE = 'https://discord.gg/';
const LINK_SITES = ['https://ko-fi.com/', `${AUTHOR}/`, DISCORD_INVITE];

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const LOCAL = /^\/(?!\/)[\w./#-]*$/;

/** Whether a note may link to `href`: a page of the game (/terms.html) or one of LINK_SITES. */
export const linkable = (href: string) => LOCAL.test(href) || LINK_SITES.some((site) => href.startsWith(site));

/** The text with each link's target through `target`. */
const mapLinks = (md: string, target: (href: string) => string) => md.replace(LINK, (_, text, href) => `[${text}](${target(href)})`);

/** A root-relative target on the game's own site, for places outside it. */
const absolute = (href: string) => (LOCAL.test(href) ? `${SITE}${href}` : href);

/** A line cut into plain text and its [text](url) links; what isn't `linkable` stays its text. */
export function splitLinks(s: string): (string | { text: string; href: string })[] {
  const parts: (string | { text: string; href: string })[] = [];
  let at = 0;
  for (const m of s.matchAll(LINK)) {
    if (m.index > at) parts.push(s.slice(at, m.index));
    parts.push(linkable(m[2]) ? { text: m[1], href: m[2] } : m[1]);
    at = m.index + m[0].length;
  }
  if (at < s.length) parts.push(s.slice(at));
  return parts;
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
    } else if (item) item.text = item.text ? `${item.text}\n${t}` : t;
    else release.intro = `${release.intro} ${plain(t)}`.trim();
  }
  return release;
}

/** v1.10.0 after v1.9.0. */
export const newestFirst = (a: Release, b: Release) => b.tag.localeCompare(a.tag, 'en', { numeric: true });

export const REPO = 'GeoGeorgeous/hidden-roof';

/** Discord's limit for one message. */
const DISCORD_MAX = 2000;

/**
 * The Discord messages: the title, the date and a link to the GitHub release, then the note, split between sections
 * (a heading and its list) where it doesn't fit one message (2000 characters); the picture goes with the last.
 */
export function discordNotes(tag: string, md: string): string[] {
  const { date } = parseRelease(tag, md);
  // <...> around a target: Discord shows no preview card. An invite shows its card all the same, and the reader is on Discord already: its text alone.
  const note = body(md).replace(LINK, (link, text, href) => (href.startsWith(DISCORD_INVITE) ? text : link));
  const [intro, ...items] = mapLinks(note, (href) => `<${absolute(href)}>`).trim().split(/\n(?=- )/);
  const messages = [`# Hidden Roof ${tag.slice(1)}\n-# ${date} · [GitHub](<https://github.com/${REPO}/releases/tag/${tag}>)\n\n${intro.trim()}`];
  for (const item of items) {
    const joined = `${messages[messages.length - 1]}\n\n${item.trim()}`;
    if (joined.length <= DISCORD_MAX) messages[messages.length - 1] = joined;
    else messages.push(item.trim());
  }
  return messages.map((m) => `${m}\n`);
}

/** The note's body for GitHub: an item's heading and each line of its text end in a hard break, but the last, so each starts its own line as in the game. */
function hardBreaks(text: string) {
  return text
    .split(/\n(?=- )/)
    .map((block) => {
      const lines = block.split('\n');
      const text = (l: string, i: number) => i > 0 && !!l.trim() && !l.trim().startsWith('-');
      const last = lines.reduce((at, l, i) => (text(l, i) ? i : at), -1);
      return lines.map((l, i) => (i < last && (i === 0 || text(l, i)) ? `${l}\\` : l)).join('\n');
    })
    .join('\n');
}

/** The GitHub release's notes: the intro, the picture at `pictureUrl` (none for a patch without one), then the items (GitHub shows the release's title above them). */
export function githubNotes(md: string, pictureUrl?: string): string {
  const text = hardBreaks(mapLinks(body(md), absolute).trim());
  const at = text.search(/^-/m);
  const intro = (at < 0 ? text : text.slice(0, at)).trim();
  const items = at < 0 ? '' : text.slice(at).trim();
  const picture = pictureUrl ? `  <img width="1200" src="${pictureUrl}" />\n\n` : '';
  return `${intro}\n\n${picture}${items}\n`;
}
