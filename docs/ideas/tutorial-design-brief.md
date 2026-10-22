# Design brief: hints in play (and the game's messages)

For the designer; no code knowledge needed. Owner's background: `docs/ideas/tutorial.md` (BL-092) and `docs/ideas/notifications.md` (BL-140).

## What and why

Hidden Roof is a first-person graffiti game: the world is ink on paper, and the only color is the paint players spray. Today's HUD frames the view like a camera recording (REC, corner brackets, a clock); that's decoration, not a game mechanic. Today a new player gets no help with the controls; the full key list sits in Settings → Controls. We want short hints in play instead: "how to move" in the first seconds, "how to use it" when a new tool is picked up, "how to switch color" when there's a second color, "how to climb" next to a ladder. A hint appears when it's needed and goes once the player has done it; learnt hints never come back.

The same screen already carries other messages: "+ MARKER" when something is picked up, "Bob joined", the low-pressure alert by the can, and soon "reconnecting". They're the same family and fight for the same space, so the proposal is **one brief for both**: hints first (they ship in 1.5.0), then toasts, the status chip and blocking errors (BL-140, later), in one visual system.

## Look at

- **Screenshots** (`docs/img/tutorial/`, the roof level, real GPU):
  - `1280x720-spawn.jpg`: the start, can in hand, empty HUD.
  - `1280x720-can-spraying-tags.jpg`: spraying; by the can: PSI gauge, CAP and COLOR tags.
  - `1280x720-low-pressure.jpg`: the red LOW PRESSURE — HOLD [RMB] TO SHAKE alert over the gauge (note how it vanishes on the white wall).
  - `1280x720-pickup-label.jpg`: a pickup's NEW TOOL / MARKER tag (manga-style, with katakana).
  - `1280x720-toast-hotbar-tools.jpg`: the "+ MARKER" toast, the hotbar with four tools, the marker in hand with its COLOR tag.
  - `min-820x560-busy-hud.jpg`: the smallest window the game runs in, everything up at once (the alert runs off the right edge).
  - `4k-3840x2160-busy-hud.jpg`: a 4K screen at 100% scaling: the HUD becomes tiny.
  - `ultrawide-3440x1440-busy-hud.jpg`: ultrawide.
- **The style:** `src/style.css` (HUD at the top, menu after it, hotbar and toast at the end) and `src/boot.css` (colors: ink `#141416`, paper `#ebe5d6`, the one alert red `#d4261c`; fonts: monospace 11 px for the HUD, Archivo for the menu, Sedgwick Ave Display for the title).
- **The ink rules:** `src/render/ink/AGENTS.md`: the world has no color except paint.
- **Messages:** `docs/ideas/notifications.md`, F4.7 (toasts unreadable over dark paint, casing mixed) and F4.10 (the earlier brief outline: types, places, states).
- **Readable already:** the nameplates over other players: paper text on a dark box (`.nameplate` in `src/style.css`).

## Palette and type

Two families exist: today's HUD and the ESC menu. Hints and messages start from the HUD and move toward the menu (Direction below). Values are from `src/boot.css` and `src/style.css`; the menu list was checked against them.

| | HUD (in play, over the game) | ESC menu (dark sheet) |
|---|---|---|
| Text | ink `#141416` (`--ui`), dim ink at .62 (`--dim`) | paper `#ebe5d6`; on paper buttons ink `#111` (`--ink`); hover `#fff` |
| Background | none (the game); the nameplate box `rgba(20,20,22,.78)` with paper text | `#000`, the game under a sheet `rgba(14,14,16,.35)`, `.72` under a page |
| Grays | — | paper at: text .85, .72, .65, .55 (`--text-2`), .45, .4 (`--text-3`); numbers and `·` .35, .3; muted .2; lines and frames .18 (`--edge`), .12, .1 (`--hair`). The CSS also uses .8, .6 and .5 often: treat the list as the scale, not every value in use |
| Alert | red `#d4261c` (`--alert`): REC dot, LOW PRESSURE | error red `#e0675e` (`--error`) |
| Type | monospace (`ui-monospace`, SF Mono, Menlo, Consolas) 11 px, letter-spacing .08em, capitals | Archivo 400/500/600 (variable, `fonts/archivo.woff2`); Sedgwick Ave Display for titles only, lowercase (`fonts/sedgwick-ave-display.woff2`) |
| Pickup tags | outlined white letters with katakana (gothic) | — |

**Direction:** the owner wants to move hints and messages away from today's bare monospace ink text, toward the ESC menu's look (paper on dark, Archivo, soft grays), simplified for play. How far is open: propose the directions (see What to deliver). Don't add a third type family or a new hue.

## Constraints

- **No new hues.** Ink, paper, black and their grays, one red for alerts: color belongs to the paint. (The ESC menu added a green dot and a second red; hints and messages don't take them.)
- **Readable over anything:** white walls under a lamp, black paint, any of 13 paint colors, the night sky, rain. Hints sit over paint all the time.
- **Windows from 820×560 up to 4K and ultrawide (21:9, 32:9).** The HUD is sized in CSS pixels and stays so in this task: design at fixed px for 1280×720 and check they hold at 820×560. Scaling with the window and the DPR is a later, separate task (TASK-197); ideas for it are welcome but not part of this delivery.
- **Keys are rebindable**, and named for the platform and keyboard layout: `W` may be `Z`, `Shift` is `⇧ Shift` on a Mac, a key may be a mouse button (`LMB`, `RMB`, `MMB`, `Mouse 4`), a wheel step (`Wheel ↑`) or unbound (`—`). Key-cap widths change; texts get longer or shorter.
- **Nothing over the crosshair** (screen center), **the hotbar** (bottom center) or **the tool-hand cluster** (follows the tool, right of center, lower half). A hint never covers what it teaches.
- **The game is fast.** No video, no blur over the moving game for every message; CSS transitions and a few elements are fine.
- **One hint at a time.** A more important one (a new tool) takes the place of a waiting one, which comes back after.
- **A picked-up tool:** the "+ MARKER" toast stays as it is for now, next to the tool's hint; the NEW TOOL tag stays. Show both together; whether the hint should replace the toast is decided later in the game.
- **English only,** no katakana under hints (unlike the pickup tags): subtitles read at a glance.
- **Hints are subtitles.** One line (or two) at the bottom center, just above the hotbar, like film subtitles. While a hint shows, a soft gradient overlay runs the full width of the screen from the bottom edge to a little above the hint, for readability; it fades with the hint. Every hint lives there, context hints too (none hang on objects in the world).
- **No blur** (no `backdrop-filter`) under hints or messages: a gradient or a flat translucent fill only.
- **Hints come and go by themselves,** like subtitles: the player never confirms or dismisses one. A simple smooth animation in and out; no "done" acknowledgement, no dimming while waiting.

## What to draw

1. **Hint kinds:** a basic hint (move, spray), a new-tool hint (two steps: "[2] take the marker", then "[LMB] draw · [Q] [E] nib"), a context hint (by a ladder).
2. **Motion:** in, on screen, out (the same out whether the player did it, its time ran out or they walked away), one hint replaced by another (step 1 to step 2 of a tool hint; a new-tool hint taking the move hint's place), the gradient with it.
3. **Key caps:** a key, a long key (`⇧ Shift`, `Space`, `Page Down`), a pair (`[Q] [E]`), four keys (`[W][A][S][D]`), mouse buttons and the wheel (icons or words?), an unbound key.
4. **One line and multi-line hints;** the longest realistic one: "walk into it or hold [SPACE] to climb · [CTRL] hold on".
5. **One replacing another:** a new-tool hint arriving while the move hint waits.
6. **With the rest of the HUD:** a hint while the PSI gauge and LOW PRESSURE are up, while a toast shows, while the hotbar changes, near the crosshair's zone.
7. **Messages (BL-140), same system:** event toast (one, a stack of three), the status chip (reconnecting, in play), a blocking error ("you're playing alone now; your paint is kept"), their places in play and on the ESC menu.
8. **At 1280×720 and 820×560** (the 4K and ultrawide shots show where scaling will matter later).

## Questions for you

1. Which direction you recommend of the ones you propose, and why.
2. Mouse buttons and the wheel: words in key caps, or small icons?
3. How the hint and toast hold at 820×560 (later scaling is TASK-197).
4. Toasts: where, now that hints take the bottom center (above the hint line, or top)?

## What to deliver

- **First, directions:** 2 or 3 distinct looks, from close to today's HUD to close to the ESC menu, each shown on two scenes (the move hint at the start; a tool hint with the "+ MARKER" toast and the hotbar) over a light and a dark background, plus one sheet with the messages (toast, a stack of three, the status chip, the blocking error). The owner picks one (or a mix).
- **Then, the chosen one in full:** mockups over the screenshots above (or new ones the owner takes), at 1280×720 and 820×560.
- Each kind's motion, with timings: in, out, replace (ms), easing.
- Sizes in px at 1280×720; spacing, paddings, stroke widths.
- Key-cap component: all variants from point 3.
- Colors and opacities as values from the palette above.
- Zones: a screen map with where each kind lives and the no-go areas.
- Optional: a short motion clip of a hint coming in, being replaced, and going.
