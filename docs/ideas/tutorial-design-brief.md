# Design brief: hints and messages in play

For the designer: everything needed is here and in the files below. (In the repo, the code spec is `docs/ideas/tutorial.md`, BL-092; not needed for this task.)

Round 1 is done: the owner's decision (hint, chip, toast, dialogue) is in `docs/ideas/tutorial.md`, Look. This brief is kept as it was sent.

## What

Hidden Roof is a first-person graffiti game: the world is ink on paper, and the only color is the paint players spray. Today's HUD frames the view like a camera recording (REC, corner brackets, a clock); that's decoration.

New players get no help with the controls. We add **hints**: short lines that teach a control when it's needed ("how to move" at the start, "how to use it" after picking up a tool, "how to climb" by a ladder) and go once the player has done it. The game's other **messages** get the same look: the event toast ("+ MARKER", "Bob joined"), the status chip ("reconnecting") and the blocking error.

## Files

- `docs/img/tutorial/`: today's HUD. 1280×720: `spawn`, `can-spraying-tags` (PSI and the tool tags by the can), `low-pressure`, `pickup-label`, `toast-hotbar-tools` ("+ MARKER" and the hotbar); `min-820x560`, `4k-3840x2160`, `ultrawide-3440x1440`.
- `src/boot.css`: color and font tokens. `src/style.css`: an excerpt, the HUD, the ESC menu's sheet, hotbar, toast.
- `public/fonts/`: Archivo, Sedgwick Ave Display.

## Look

Today the HUD is bare monospace ink text (11 px, capitals), unreadable over dark paint. The ESC menu is paper on a dark sheet in Archivo. **Direction:** move hints and messages toward the menu's look, simplified for play. How far is yours to propose.

| | HUD today | ESC menu |
|---|---|---|
| Text | ink `#141416`, dim at .62 | paper `#ebe5d6`; ink `#111` on paper buttons; hover `#fff` |
| Grays | — | paper at .85, .72, .65, .55, .45 (text); .35, .3 (numbers, `·`); .2 (muted); .18, .12, .1 (lines, frames) |
| Ground | none; nameplates: paper on `rgba(20,20,22,.78)` | `#000`; the game under `rgba(14,14,16,.35)` |
| Red | `#d4261c` (alerts) | `#e0675e` (errors) |
| Type | monospace 11 px | Archivo 400/500/600; Sedgwick Ave Display for titles only, lowercase |

## Rules

- **Hints are subtitles:** one line, or two, at the bottom center just above the hotbar. While one shows, a soft gradient runs the full width from the bottom edge to a little above it. Every hint shows there.
- **They come and go by themselves,** with a simple smooth fade. The player never confirms or dismisses one. One hint at a time; a more important one takes the place of the one showing.
- **No new hues** (color belongs to the paint) and **no blur** (`backdrop-filter`): gradients and translucent fills only.
- **Nothing over the crosshair, the hotbar or the tool tags by the hand** (right of center, lower half).
- **Keys are rebindable** and named per platform and keyboard layout: `W` may be `Z`, `Shift` is `⇧ Shift` on a Mac, a key may be a mouse button (`LMB`) or the wheel. Key caps change width.
- **English only,** no katakana.
- **Fixed px,** designed at 1280×720, holding at 820×560. Scaling for 4K is a later task.
- The "+ MARKER" toast stays beside the tool's hint.

Hint texts to use: `[W][A][S][D] move · [SHIFT] run · [SPACE] jump`; a tool in two steps, `[2] take the marker`, then `[LMB] draw · [Q] [E] nib`; the longest, `walk into it or hold [SPACE] to climb · [CTRL] hold on`.

## Round 1: directions (stop here; the owner picks)

Three distinct directions, from close to today's HUD to close to the ESC menu. Each as static HTML/CSS over the screenshots:

1. **The scene:** the marker hint (step 2) with the "+ MARKER" toast and the hotbar, over a light ground (`1280x720-toast-hotbar-tools.jpg`) and a dark one (the same with black paint under the hint).
2. **Messages:** a stack of three toasts, the status chip "reconnecting", and the blocking error "you're playing alone now; your paint is kept", in play.

With each direction: two lines on why. Then answer:

1. Which direction you recommend, and why.
2. Mouse buttons and the wheel: words in key caps, or small icons?
3. Where the toasts go, now that hints take the bottom center.

## Round 2: the chosen direction (after the owner's pick)

- The hint's motion: in, out, one replacing another (ms, easing in the CSS).
- Key caps: a key, a long key (`⇧ Shift`, `Space`), a mouse button, the wheel.
- The same at 820×560.
