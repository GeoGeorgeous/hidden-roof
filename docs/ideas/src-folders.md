# src/ in folders (RFCT-202)

Planned for 1.8.0 (owner, 2026-10-25). On 2026-10-25 `src/` had 69 loose files next to 15 folders. A plain move into folders, with no barrel `index.ts` and no new module layer; behavior identical, full `npm run check` before and after.

## Where the root files go

| Folder | From the root |
|---|---|
| `paint/` | `paint-*.ts`, `painting.ts`, `page-packer.ts`, `op-wire.ts`, `surfaces.ts` |
| `menu/` | `pause-menu`, `menu-ui`, `settings-*`, `controls-tab`, `credits-page`, `updates-page`, `release-notes`, `perf-test-page`, `dialog-view`, `ui-icons`, `social-icons`, `links` |
| `input/` | `input`, `key-bindings`, `key-name`, `esc-hold`, `fullscreen` |
| `render/` | `textures`, `materials`, `sky`, `skyline` |
| `boot/` | `boot.ts`, `boot.css`, `loading`, `loading-line`, `browser-guards`, `gpu-name`, `small-screen.*`, `frame-guard` |

The root keeps about 20: `main`, `config`, `messages`, `version`, and small helpers (`lcg`, `hex-color`, `stored`, ...).

## With it

- `style.css` (2897 lines) splits by its sections into CSS next to the code that uses it, imported from that `.ts` (as `small-screen.css` is): `hud.css`, `pause-menu.css`, `settings.css`, `popups.css`, `perf-test.css`, `updates.css`; tokens and base styles stay in `style.css`. Vite still bundles one CSS file. Risk: cascade order across sections; check with `npm run shots` and golden.
- Then drop the CSS exemption from the ~400-line rule in `AGENTS.md`.
- A folder may get its own `AGENTS.md` (paint rules next to the paint code).
- Update the ~25 file paths named in docs and `AGENTS.md`.

## Order

1. `menu/`, `input/`, `boot/`, `render/`, and the CSS split.
2. `paint/` only after the Painting Rework (1.7.0) is merged: `exp/painting-rework` edits five of the `paint-*` files.

Cost: 2–3 hours and a full check.
