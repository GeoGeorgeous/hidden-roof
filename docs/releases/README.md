# Release notes

The Updates popup (ESC → About → Updates, `src/updates-page.ts`) shows these, bundled with the game: one `<tag>.md` per release, the GitHub release's notes as written there (a `#` title, the intro, an `<img>`, then `- **heading**` items, with `- **term**: description` or plain `-` lists under some). Each release's picture is `public/updates/<tag>.webp` (1280×720): the site's CSP takes images from the game's own address only.

On a release: put its notes here and its picture there, in the release commit.
