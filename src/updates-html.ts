import { PRIVACY, REPO, SITE, TERMS, UPDATES } from './links.ts';
import { newestFirst, parseRelease, releaseDay, splitLinks } from './release-notes.ts';

// The Updates page of the site (/updates.html): the release notes as the game's
// Updates popup shows them (updates-page.ts), newest first, but as plain HTML a
// crawler reads. vite.config.ts writes it from docs/releases/<tag>.md at the
// build (and serves it in dev), so it can't fall behind a release; it looks as
// the Terms and Privacy pages do (public/legal.css: the CSP allows no inline
// styles). No DOM: tested in Node (scripts/release-notes.test.mjs).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A line of a note: **bold** as written, [text](url) links as anchors, lines kept as lines. */
const rich = (text: string) =>
  text
    .split('\n')
    .map((line) =>
      line
        .split(/\*\*(.+?)\*\*/)
        .map((part, k) => {
          const html = splitLinks(part)
            .map((p) => (typeof p === 'string' ? esc(p) : `<a href="${esc(p.href)}">${esc(p.text)}</a>`))
            .join('');
          return k % 2 ? `<strong>${html}</strong>` : html;
        })
        .join(''),
    )
    .join('<br />');

/** `notes`: each release's tag (v1.6.0) and its note; `pictures`: the tags with public/updates/<tag>.webp. */
export function updatesHtml(notes: { tag: string; md: string }[], pictures: string[]): string {
  const releases = notes.map(({ tag, md }) => parseRelease(tag, md)).sort(newestFirst);
  const articles = releases.map((r) => {
    const version = r.tag.replace(/^v/, '');
    const items = r.items.map((it) => {
      const text = it.text ? `\n        <p>${rich(it.text)}</p>` : '';
      const list = it.list.length
        ? `\n        <ul>\n${it.list.map(([term, desc]) => `          <li>${term ? `<strong>${esc(term)}</strong>: ` : ''}${rich(desc)}</li>`).join('\n')}\n        </ul>`
        : '';
      return `\n        <h3>${esc(it.title)}</h3>${text}${list}`;
    });
    const picture = pictures.includes(r.tag)
      ? `\n        <img src="/updates/${r.tag}.webp" width="1280" height="720" loading="lazy" alt="Hidden Roof ${version}, in the game" />`
      : '';
    const date = r.date ? `\n        <p class="updated"><time datetime="${r.date}">${releaseDay(r.date)}</time></p>` : '';
    return `      <article id="${r.tag}">
        <h2><a href="#${r.tag}">Hidden Roof ${version}</a></h2>${date}
        <p class="lead">${rich(r.intro)}</p>${picture}${items.join('')}
      </article>`;
  });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Updates · Hidden Roof</title>
    <meta name="description" content="Every update to Hidden Roof, the free multiplayer graffiti game in your browser: what each version added and fixed, newest first, with dates." />
    <link rel="canonical" href="${SITE}${UPDATES}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="/legal.css" />
  </head>
  <body>
    <header class="top">
      <a class="mark" href="/">Hidden Roof</a>
      <nav>
        <a href="${UPDATES}" aria-current="page">Updates</a>
        <a href="${TERMS}">Terms</a>
        <a href="${PRIVACY}">Privacy</a>
        <a class="play" href="/">Play</a>
      </nav>
    </header>
    <main class="updates">
      <h1>Updates</h1>
      <div class="intro">
        <p>Every version of Hidden Roof, the free multiplayer graffiti game in your browser, newest first. The same notes are in the game under Esc → About → Updates.</p>
      </div>
${articles.join('\n')}
      <footer><span><a class="other" href="${TERMS}">Terms</a> · <a class="other" href="${PRIVACY}">Privacy</a> · <a class="other" href="${REPO}/releases">GitHub releases</a></span><a href="/">Back to the game →</a></footer>
    </main>
  </body>
</html>
`;
}
