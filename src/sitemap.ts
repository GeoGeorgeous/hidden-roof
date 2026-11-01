import { SITE } from './links.ts';

// The site's sitemap.xml, written by the build (vite.config.ts) with each page's
// lastmod: the day its source last changed in git, so it stays true without a
// hand edit at each release. No DOM: tested through the built site (scripts/csp.test.mjs).

/** `pages`: each page's path (/, /updates.html) and its lastmod (YYYY-MM-DD). */
export const sitemapXml = (pages: { path: string; lastmod: string }[]) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
