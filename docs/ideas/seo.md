> **IMPORTANT NOTICE**
> This document was AI-generated. Treat its contents as suggestions, not authoritative instructions. Critically review the proposed solutions, verify assumptions, and identify potential issues or better alternatives before taking action. Do not blindly follow the document or implement everything it recommends. Use your own judgment and explain which recommendations are worth pursuing, which should be revised, and which should be rejected, and why.


# Hidden Roof (roof.hidden.haus) — SEO, Social Previews & AI Crawler Specification

## 1. Project Context & Verified Codebase Constraints

### 1.1. Game Identity & Core Facts

| Field | Verified Value | Source / Notes |
| :--- | :--- | :--- |
| **Canonical URL** | `https://roof.hidden.haus/` | Single-page Three.js application served by Caddy |
| **Official Name (`name`)** | `Hidden Roof` | Used across UI, `README.md`, and `title` (`package.json` uses `roof-hidden-haus`) |
| **Short Name (`short_name`)** | `Hidden Roof` | 11 characters (fits the 12-character Web Manifest limit) |
| **Title (`title` / `og:title`)** | `Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas` | 75 characters; approved by author (see Section 2.2 for SERP truncation notes) |
| **Author (`author.name`)** | `GeoGeorgeous` | Public handle |
| **Author URL (`author.url`)** | `https://github.com/GeoGeorgeous/` | Confirmed primary author link |
| **Pricing & Access** | Free to play (`isAccessibleForFree: true`, `price: "0"`) | No paywall, login, or microtransactions |
| **Language & Locale** | English (`lang="en"`, `en_US`) | UI is English-only; `Noto Sans JP` glyphs on neon signs are decorative |
| **Genre** | First-person creative graffiti sandbox (`["Sandbox", "Simulation", "Art", "Graffiti", "Design", "First-person"]`) | Inspired by [Bombing\!\!](https://www.google.com/search?q=https%3A%2F%2Fstore.steampowered.com%2Fapp%2F1527520%2F), [Marc Ecko's Getting Up](https://www.google.com/search?q=https%3A%2F%2Fstore.steampowered.com%2Fapp%2F260190%2F), and Daisuke Tajima's [Beyond the Lines](https://www.google.com/search?q=https%3A%2F%2Fwww.seigensha.com%2Fbooks%2F978-4-86152-902-3%2F) |
| **Play Modes** | `SinglePlayer`, `MultiPlayer` (1 to 20 players) | Multiplayer sessions use a 5-letter host code (`SERVER.maxPlayers = 20`). After 1.6.0 There will be public sessions 24/7 |
| **Platform Requirements** | Desktop Web Browser with WebGL2, keyboard & mouse, touchpad is supported | Minimum viewport `820x560` CSS px (`RENDER.minViewport`); touch/mobile devices see fallback Screen 10 |

### 1.2. Visual Style, World & Gameplay Mechanics

* **Atmosphere & Post-Processing:** A dystopian pen-and-ink city at night under rain, fog, lightning, and flickering neon. Tone maps to paper, hatching, cross-hatching, or solid black with depth-buffer pen outlines. Players can switch between three ink styles: **NEW MANGA** (default), **OLD MANGA**, and **RETRO LIGHT**. Everything (geometry, textures, audio) is procedurally generated in code.
* **The Rooftop Level (`public/levels/roof.json`):** Contains **1,340 paintable props** (buildings, railings, AC units, skylights, 7 panning/tilting CCTV cameras with real-time spotlights, neon and blade signs, billboards, scaffolding, ladders, fire escapes, a gondola, a water tower, and traffic cones).
* **Tools & Pickups (19 hidden items):** Players start with a spray can and black paint, and can discover **14 paint colors** (red, pink, green, orange, blue, brown, cyan, lime, white, purple, teal, yellow, and others), **4 spray caps** (from skinny to fat), a **paint roller**, a **stepladder**, and a **sponge** to scrub paint off. Paint drips, runs, and crosses seams between props.

### 1.3. Default Controls (`src/config.ts`, Rebindable in Settings)

| Action | Default Binding |
| :--- | :--- |
| **Move** | `W A S D` or Arrow keys |
| **Run** | `Shift` (or double-tap forward) |
| **Jump / Climb Ladder** | `Space` |
| **Crouch** | `Ctrl` or `C` |
| **Spray / Use Tool** | Left mouse button |
| **Shake Can** | Right mouse button |
| **Next / Previous Color** | Mouse wheel |
| **Eyedropper (Pick Color)** | Middle mouse button |
| **Cap Size / Width** | `E` (larger), `Q` (smaller) |
| **Tool Slots** | `1` – `5` |
| **Screenshot** | `K` (downloads PNG) |
| **Pause Menu** | `Esc` (hold to exit fullscreen) |

### 1.4. Hard Technical Constraints (Must Not Break During Implementation)

> This section may contain legacy implementation, suggest different options to owner how to improve it, for example by using a unique ID or a seperate component for a gaming canvas or loading screen, limit the use of inline CSS or hacky JS DOM manipulations.

> If some changes require chaning the host (VPS) - suggest user to do it on VPS instead of finding hacky ways to bypass it.

1. **Strict CSP & Inline Script Hash (`vite.config.ts`, `docs/deploy.md`):**
   * Caddy serves `script-src 'self' <hash>`, where the hash covers the single inline boot script.
   * The build script matches bare `<script>` tags only and **throws a build error** if more than one bare `<script>` exists.
   * `<script type="application/ld+json">` is a non-executable data block: it does not match the bare `<script>` regex and is not blocked by `script-src`. Never add any bare `<script>` tag to `index.html`.
2. **DOM Lifecycle & `.loading` Structure (`src/loading.ts`, `src/boot.ts`, `src/small-screen.ts`):**
   * `index.html` must keep `<div class="loading"><b>Hidden Roof</b><p><span class="on">Loading</span><span></span></p></div>` intact. `loadStep()` queries those exact two `<span>` elements and throws if they are missing.
   * `boot.ts` `failed()` already rewrites the second `<span>` when WebGL2 is unavailable (`"The game needs WebGL..."`). Do not create a competing WebGL fallback container; if needed, only enrich the text inside `failed()` in `src/boot.ts`.
   * `body` has `overflow: hidden; height: 100%`, and `src/boot.css` defines `[hidden] { display: none !important; }`. Placing semantic HTML inside `<main hidden>` keeps it completely invisible to sighted players and prevents layout shifts while remaining fully readable in the raw HTML source for search crawlers and LLM parsers.
3. **Caddy Static Serving (`Caddyfile`):**
   * Caddy uses `root * /srv/roof` and `file_server`, so any file placed in Vite's `public/` directory (`public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/site.webmanifest`) is copied to `dist/` on build and served directly at `/` with `Cache-Control: no-cache`.

## 2. Decisions & Options Under Discussion

### 2.1. Decision 1: Meta Description & Open Graph Description (Choose 1 of 4)

Your original GitHub text is **319 characters**:
> "Hidden Roof is a first-person graffiti game. you climb onto the rooftops of a city drawn in ink, and the only color in it is the paint you bring. there are no enemies and no goals: find your tools, paint whatever you like, scrub it off, paint again. or bring a friend and paint the same roof together."

Because Google truncates `<meta name="description">` around **155–160 characters** (and Open Graph cards look sharpest under 160–240 characters), we keep your full GitHub text inside `llms.txt` and `<main hidden>`, and pick a compressed version for `<meta name="description">` and `og:description`:

| Option | Proposed Text | Length | Vibe & Focus |
| :--- | :--- | :--- | :--- |
| **Option A (Closest to GitHub original)** | `Climb onto a dystopian rooftop city drawn in ink, where the only color is the paint you bring. A creative first-person graffiti sandbox — solo or with friends.` | 159 chars | Poetic, preserves "drawn in ink, where the only color is the paint you bring", mentions creative sandbox + solo/multiplayer. |
| **Option B (Freedom & Zero-Rules focus)** | `A creative first-person graffiti game in a dystopian pen-and-ink city. No enemies, no goals — find your tools and paint every rooftop solo or with friends.` | 155 chars | Highlights "no enemies, no goals", dystopian pen-and-ink aesthetic, freedom of painting, solo & multiplayer. |
| **Option C (Atmospheric & Sensory)** | `Every rooftop is a blank canvas in a rainy, ink-drawn dystopian city. A free browser graffiti sandbox to spray, drip, and repaint solo or with up to 20 friends.` | 160 chars | Connects directly to the title's "blank canvas", emphasizes rain/ink dystopia, paint physics, and 20-player co-op. |
| **Option D (Two-tier split: Short SEO + Full GitHub for OG)** | **SEO `description`:** Option A or B (155 chars). **Social `og:description`:** `Climb onto the rooftops of a dystopian city drawn in ink, where the only color is the paint you bring. No enemies, no goals: find your tools, paint whatever you like, scrub it off, or bring friends and paint the same roof together.` | 155 / 233 chars | Keeps Google SERP snippet cleanly under 160 chars while giving Discord and Telegram cards almost the entire original GitHub prose. |

### 2.2. Decision 2: Title Strategy (`title` vs. `og:title`)

* **Your chosen title:** `Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas` (75 characters).
* **How it behaves:**
  * **Browser tab, Discord, Telegram, X, and LLM parsers:** Displays in full and reads naturally.
  * **Google Search results (SERP):** Google measures `<title>` width in pixels (~600px, roughly 58–62 characters) and truncates the rest with `...` (`Hidden Roof · browser-based graffiti game · every rooftop...`).
* **Recommendation:** Keep your full 75-character string in `<title>`, `og:title`, and `twitter:title` — even when Google trims the tail in search results, the first 42 characters (`Hidden Roof · browser-based graffiti game`) already contain the exact brand name and primary keyword before the cutoff.

### 2.3. Decision 3: Social Networks (Discord, Instagram, YouTube, Reddit, GitHub)

We can include all five platforms across three layers without cluttering the UI:
1. **`src/links.ts` (Single Source of Truth):** Store `GITHUB_REPO`, `AUTHOR_GITHUB`, `DISCORD`, `INSTAGRAM`, `YOUTUBE`, and `REDDIT`.
2. **JSON-LD (`sameAs` property):** In [Schema.org VideoGame](https://www.google.com/search?q=https%3A%2F%2Fschema.org%2FVideoGame), add a `sameAs` array containing the official community links (GitHub repo, Discord, YouTube, Instagram, Reddit), and put `https://github.com/GeoGeorgeous/` in `author.url`. Search engines and knowledge graphs use `sameAs` to link a game and its creator to official social profiles.
3. **`<main hidden>` & `public/llms.txt`:** Add a `Community & Official Links` section with all 5 URLs so AI agents (ChatGPT, Claude, Perplexity) can answer questions about official channels.

*(Pending inputs to fill in Section 3 below: exact URLs for Instagram, YouTube, Reddit, and the full GitHub repo URL).*

### 2.4. Decision 4: Screenshot & Designer Asset Workflow

Since you don't want automated placeholder images pushed to production before the designer creates the final artwork, we split the visual pipeline into two steps:
* **Step A (Now — Claude Code screenshot generation for Designer):**
  * Have Claude Code run `npm run shots` (or a custom capture configuration) to export high-resolution raw screenshots (`1920x1080` or `2560x1440` PNGs) showing:
    1. A wide shot of the ink-drawn rooftop city with rain/neon and vivid graffiti splashes.
    2. A first-person action shot with the spray can in hand and paint dripping across props.
    3. Contrast comparisons of the ink styles (`NEW MANGA`, `OLD MANGA`, `RETRO LIGHT`).
  * You hand those raw captures to your designer along with the asset table (Section 4).
* **Step B (How to handle `og:image` in `index.html` while waiting for the designer):**
  * Keep the `og:image` and `twitter:image` lines commented out in `index.html` until the designer delivers `public/og-image.jpg`. This prevents Telegram and Discord from caching a broken `404` image or a raw unstyled screenshot.

### 2.5. Decision 5: `robots.txt` Audit Task for Claude Code

Before writing `public/robots.txt`, Claude Code will inspect `public/`, `src/`, `vite.config.ts`, and `Caddyfile` to classify every path:
* **Must Remain Allowed (`Allow: /`):**
  * `/` (`index.html`)
  * `/assets/*` (Googlebot's headless Chromium needs JS and CSS bundles to render the page and verify layout)
  * `/favicon.svg` and future icon/OG image files
  * `/sitemap.xml`, `/llms.txt`, `/site.webmanifest`
* **Candidates to Disallow (to prevent raw JSON/asset bloat in search index):**
  * `/levels/` (raw level JSON files like `public/levels/roof.json`)
  * `/ws` (WebSocket multiplayer endpoint)
  * `/licenses/` (plain-text font/library license files)
  * `/updates/` (internal patch-note images, unless you want them indexed in Google Images)

## 3. Implementation Blueprint for Claude Code

> **Instructions for Claude Code:** Once all placeholders marked `[TODO: ...]` below are confirmed, apply the following changes to the repository and run `npm run build` to verify TypeScript compilation and the CSP inline-script hash check.

### 3.1. Task 1: Audit Routes & Generate Raw Screenshots for Designer

1. Inspect `public/`, `src/`, `vite.config.ts`, and deployment configs (`Caddyfile` / `docs/deploy.md`) and list all public directories and endpoints. Confirm whether any path beyond `/levels/`, `/ws`, and `/licenses/` should be disallowed in `public/robots.txt`.
2. Run or use the screenshot capture workflow (`npm run shots`) to save 4–6 high-resolution raw gameplay screenshots into a temporary folder (e.g., `shots/designer-pack/`, gitignored) so the project designer can use them to compose `og-image.jpg` (`1200x630`) and `screenshot-wide.jpg` (`1920x1080`).

### 3.2. Task 2: Update `index.html`

* Keep `<meta name="game-files" ...>` and `<div class="loading"><b>Hidden Roof</b><p><span class="on">Loading</span><span></span></p></div>` completely unchanged.
* Do **not** add any bare `<script>` tag.
* Insert the SEO meta tags, Open Graph / Twitter Card tags, manifest link, and `<script type="application/ld+json">` inside `<head>`, and add `<main hidden>` + `<noscript>` inside `<body>`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <title>Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas</title>
    <meta name="description" content="[TODO: SELECTED_META_DESCRIPTION]" />
    <link rel="canonical" href="https://roof.hidden.haus/" />
    <meta name="robots" content="index, follow" />
    <meta name="author" content="GeoGeorgeous" />
    <meta name="theme-color" content="#000000" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Hidden Roof" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:url" content="https://roof.hidden.haus/" />
    <meta property="og:title" content="Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas" />
    <meta property="og:description" content="[TODO: SELECTED_OG_DESCRIPTION]" />
    <!-- Uncomment once designer delivers public/og-image.jpg (1200x630):
    <meta property="og:image" content="https://roof.hidden.haus/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Hidden Roof — first-person graffiti sandbox in a pen-and-ink rooftop city" />
    -->

    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas" />
    <meta name="twitter:description" content="[TODO: SELECTED_META_DESCRIPTION]" />
    <!-- Uncomment once designer delivers public/og-image.jpg:
    <meta name="twitter:image" content="https://roof.hidden.haus/og-image.jpg" />
    -->

    <!-- Icons & Web Manifest -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/site.webmanifest" />

    <!-- Structured Data (Schema.org VideoGame & WebApplication) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": ["VideoGame", "WebApplication"],
      "name": "Hidden Roof",
      "alternateName": "Hidden Roof — Browser-Based Graffiti Game",
      "url": "https://roof.hidden.haus/",
      "description": "Hidden Roof is a first-person graffiti game in your browser. Climb onto the rooftops of a dystopian city drawn in ink, where the only color is the paint you bring. No enemies and no goals: find your tools, paint whatever you like, scrub it off, or host a multiplayer session and paint the same roof together with up to 20 friends.",
      "inLanguage": "en",
      "applicationCategory": "Game",
      "genre": ["Sandbox", "Simulation", "Art", "Graffiti Game"],
      "gamePlatform": ["Web browser (desktop)"],
      "operatingSystem": "Any (Desktop browser with WebGL2)",
      "playMode": ["SinglePlayer", "MultiPlayer"],
      "numberOfPlayers": {
        "@type": "QuantitativeValue",
        "minValue": 1,
        "maxValue": 20
      },
      "isAccessibleForFree": true,
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock"
      },
      "author": {
        "@type": "Person",
        "name": "GeoGeorgeous",
        "url": "https://github.com/GeoGeorgeous/"
      },
      "sameAs": [
        "[TODO: GITHUB_REPO_URL]",
        "https://discord.gg/yj8z9sxBrf",
        "[TODO: INSTAGRAM_URL]",
        "[TODO: YOUTUBE_URL]",
        "[TODO: REDDIT_URL]"
      ]
    }
    </script>

    <!-- Keep existing font preloads, game-files meta, and boot script below -->
```

And inside `<body>` right after `<div class="loading">...</div>`:

```html
    <main hidden>
      <h1>Hidden Roof — Browser-Based First-Person Graffiti Game</h1>
      <p>
        Hidden Roof is a creative first-person graffiti sandbox in your browser. You climb onto the rooftops of a dystopian city drawn in ink, and the only color in it is the paint you bring. There are no enemies and no goals: find your tools, paint whatever you like, scrub it off, and paint again — solo or with up to 20 friends on the same roof.
      </p>

      <section>
        <h2>Features & Atmosphere</h2>
        <ul>
          <li><strong>Pen-and-Ink Dystopian City:</strong> Post-processed hatching, cross-hatching, paper tones, and depth-buffer pen outlines across three visual styles (New Manga, Old Manga, Retro Light) set in a rainy night with fog, lightning, and flickering neon.</li>
          <li><strong>Everything Is Paintable:</strong> 1,340 rooftop props including buildings, billboards, AC units, skylights, panning CCTV cameras with spotlights, scaffolding, ladders, fire escapes, a water tower, and a gondola.</li>
          <li><strong>Tools & 19 Hidden Pickups:</strong> Spray can with 4 cap widths, paint roller, stepladder, sponge to scrub paint off, eyedropper, and 14 hidden paint colors. Paint drips, runs, and crosses seams between surfaces.</li>
          <li><strong>Solo & Co-op Multiplayer:</strong> Paint at your own pace in single-player or share a 5-letter room code to paint the same rooftop with up to 20 players.</li>
        </ul>
      </section>

      <section>
        <h2>Default Controls (Desktop Keyboard & Mouse)</h2>
        <ul>
          <li><strong>Move:</strong> W A S D or Arrow keys</li>
          <li><strong>Run:</strong> Shift (or double-tap forward)</li>
          <li><strong>Jump / Climb Ladder:</strong> Space</li>
          <li><strong>Crouch:</strong> Ctrl or C</li>
          <li><strong>Spray / Use Tool:</strong> Left mouse button</li>
          <li><strong>Shake Can:</strong> Right mouse button</li>
          <li><strong>Next / Previous Color:</strong> Mouse wheel</li>
          <li><strong>Eyedropper:</strong> Middle mouse button</li>
          <li><strong>Cap Width:</strong> E (larger), Q (smaller)</li>
          <li><strong>Tool Slots:</strong> 1–5</li>
          <li><strong>Screenshot:</strong> K (downloads PNG)</li>
          <li><strong>Pause Menu:</strong> Esc (hold to leave fullscreen)</li>
        </ul>
        <p>Requires a desktop browser with WebGL2 support, a keyboard, a mouse, and a minimum window size of 820x560 pixels.</p>
      </section>

      <section>
        <h2>Official Links & Community</h2>
        <ul>
          <li><a href="https://github.com/GeoGeorgeous/">Created by GeoGeorgeous</a></li>
          <li><a href="[TODO: GITHUB_REPO_URL]">GitHub Repository</a></li>
          <li><a href="https://discord.gg/yj8z9sxBrf">Discord Community</a></li>
          <li><a href="[TODO: INSTAGRAM_URL]">Instagram</a></li>
          <li><a href="[TODO: YOUTUBE_URL]">YouTube</a></li>
          <li><a href="[TODO: REDDIT_URL]">Reddit</a></li>
        </ul>
      </section>
    </main>

    <noscript>
      <p>Hidden Roof is a 3D first-person browser graffiti game built with Three.js and WebGL2. Please enable JavaScript in a desktop browser (minimum window size 820x560) to play.</p>
    </noscript>
```

### 3.3. Task 3: Create `public/robots.txt`

```txt
User-agent: *
Allow: /
Disallow: /levels/
Disallow: /ws
Disallow: /licenses/

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: https://roof.hidden.haus/sitemap.xml
```

### 3.4. Task 4: Create `public/sitemap.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://roof.hidden.haus/</loc>
    <lastmod>2026-10-19</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

### 3.5. Task 5: Create `public/llms.txt`

```text
# Hidden Roof

> Hidden Roof · browser-based graffiti game · every rooftop is a blank canvas.

Hidden Roof is a free first-person 3D graffiti sandbox game for desktop web browsers, built with Three.js and WebGL2. You climb onto the rooftops of a dystopian city drawn in ink, and the only color in it is the paint you bring. There are no enemies and no goals: find your tools, paint whatever you like, scrub it off, and paint again — solo or with up to 20 friends in the same multiplayer session.

## Key Facts
- **Play URL:** https://roof.hidden.haus/
- **Creator:** [GeoGeorgeous](https://github.com/GeoGeorgeous/) (Idea & development: GeoGeorgeous & Claude)
- **Genre:** Creative First-Person Graffiti Sandbox / 3D Art Game
- **Game Modes:** Single-player & Co-op Multiplayer (up to 20 players via 5-letter room code)
- **Pricing:** Free to play in browser (no account or installation required)
- **System Requirements:** Desktop web browser with WebGL2, hardware acceleration, keyboard & mouse, minimum viewport 820x560 px (mobile/touch devices are not supported)

## World, Art Style & Tools
- **Pen-and-Ink Dystopia:** Procedural geometry, textures, and sound. Post-processing renders paper tones, hatching, cross-hatching, and depth-buffer ink outlines across three selectable styles (`NEW MANGA`, `OLD MANGA`, `RETRO LIGHT`) under rain, fog, lightning, and flickering neon.
- **Paintable Rooftop City:** 1,340 props on the roof level (`buildings`, `billboards`, `blade signs`, `AC units`, `skylights`, `7 pan-and-tilt CCTV cameras with spotlights`, `scaffolding`, `ladders`, `fire escapes`, `water tower`, `gondola`, `traffic cones`).
- **Tools & 19 Hidden Pickups:** Start with a spray can and black paint. Explore the roof to find 14 additional colors (`red`, `pink`, `green`, `orange`, `blue`, `brown`, `cyan`, `lime`, `white`, `purple`, `teal`, `yellow`, etc.), 4 spray caps (`skinny` to `fat`), a `paint roller`, a `stepladder`, and a `sponge` to scrub paint off. Paint drips, runs, and crosses seams between surfaces.
- **Inspirations:** Bombing!! & Bombing!! 2, Marc Ecko's Getting Up, and Daisuke Tajima's Beyond the Lines.

## Controls (Rebindable in Settings)
- **Move:** `W A S D` or Arrow keys
- **Run:** `Shift` (or double-tap forward)
- **Jump / Climb Ladder:** `Space`
- **Crouch:** `Ctrl` or `C`
- **Spray / Use Tool:** Left mouse button
- **Shake Can:** Right mouse button
- **Next / Previous Color:** Mouse wheel
- **Eyedropper:** Middle mouse button
- **Cap Width:** `E` (bigger), `Q` (smaller)
- **Tool Slots:** `1`–`5`
- **Screenshot:** `K` (saves PNG)
- **Pause Menu:** `Esc` (hold to exit fullscreen)

## Community & Official Links
- [Play Hidden Roof](https://roof.hidden.haus/)
- [Author GitHub — GeoGeorgeous](https://github.com/GeoGeorgeous/)
- [GitHub Repository]([TODO: GITHUB_REPO_URL])
- [Discord Community](https://discord.gg/yj8z9sxBrf)
- [Instagram]([TODO: INSTAGRAM_URL])
- [YouTube]([TODO: YOUTUBE_URL])
- [Reddit]([TODO: REDDIT_URL])
```

### 3.6. Task 6: Create `public/site.webmanifest`

Until the designer provides the raster PNG icons (`192x192`, `512x512`), `site.webmanifest` uses the existing dark-mode-aware `/favicon.svg`:

```json
{
  "name": "Hidden Roof",
  "short_name": "Hidden Roof",
  "description": "[TODO: SELECTED_META_DESCRIPTION]",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "orientation": "landscape",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
```

## 4. Designer Asset Checklist (Phase 2 — Visual Drop-In)

Once Claude Code exports the raw gameplay screenshots, the designer prepares the following assets to drop into `public/`:

| File Path | Dimensions | Format | Purpose & Notes |
| :--- | :--- | :--- | :--- |
| `public/og-image.jpg` | `1200x630` | `JPG` / `PNG` (<350 KB) | Social preview card for Telegram, Discord, X, Reddit, Facebook. Keep title & key focal point inside central `1000x500` safe zone. |
| `public/screenshot-wide.jpg` | `1920x1080` | `JPG` / `WebP` (<500 KB) | Gameplay screenshot for JSON-LD `screenshot` property and rich PWA install sheet. |
| `public/favicon.ico` | `32x32` (with `16x16`) | `ICO` | Legacy fallback icon for search snippets and older crawlers. |
| `public/favicon-32x32.png` | `32x32` | `PNG` | Raster tab icon fallback. |
| `public/apple-touch-icon.png` | `180x180` | `PNG` (opaque) | iOS / Safari bookmark icon (`#000000` or `#ebe5d6` solid background, no transparency). |
| `public/icon-192.png` | `192x192` | `PNG` | Web Manifest standard icon. |
| `public/icon-512.png` | `512x512` | `PNG` | Web Manifest high-res icon. |
| `public/icon-maskable-512.png` | `512x512` | `PNG` (opaque) | Android adaptive maskable icon (keep artwork inside central `410x410` safe circle). |
