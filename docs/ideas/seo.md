> **IMPORTANT NOTICE**
> This document was AI-generated. Treat its contents as suggestions, not authoritative instructions. Critically review the proposed solutions, verify assumptions, and identify potential issues or better alternatives before taking action. Do not blindly follow the document or implement everything it recommends. Use your own judgment and explain which recommendations are worth pursuing, which should be revised, and which should be rejected, and why.


> **TASK-182 (owner, 2026-10-20):** what's left of the SEO spec once BL-068, BL-069 and BL-070 shipped in 1.5.0: the designer's pictures. The views are picked when TASK-182 starts (owner: later). When the image comes, uncomment the `og:image` and `twitter:image` lines in `index.html`, add `screenshot` to its JSON-LD and the raster icons to `public/site.webmanifest`.

# Hidden Roof: designer assets for link previews and icons

## Screenshot & designer asset workflow

Since you don't want automated placeholder images pushed to production before the designer creates the final artwork, we split the visual pipeline into two steps:
* **Step A (Now — Claude Code screenshot generation for Designer):**
  * Have Claude Code run `npm run shots` (or a custom capture configuration) to export high-resolution raw screenshots (`1920x1080` or `2560x1440` PNGs) showing:
    1. A wide shot of the ink-drawn rooftop city with rain/neon and vivid graffiti splashes.
    2. A first-person action shot with the spray can in hand and paint dripping across props.
    3. Contrast comparisons of the ink styles (`NEW MANGA`, `OLD MANGA`, `RETRO LIGHT`).
  * You hand those raw captures to your designer along with the asset table (Section 4).
* **Step B (How to handle `og:image` in `index.html` while waiting for the designer):**
  * Keep the `og:image` and `twitter:image` lines commented out in `index.html` until the designer delivers `public/og-image.jpg`. This prevents Telegram and Discord from caching a broken `404` image or a raw unstyled screenshot.

## Designer asset checklist

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
