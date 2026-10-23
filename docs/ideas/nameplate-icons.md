# Nameplate icons (DSGN-207)

The tag over another player's head says what they're doing with an icon after the name. The game draws placeholders now (`public/icons/note-*.svg`); the designer's six replace them one for one, same file names. The tag itself stays as it is.

## The tag as it is

| | |
|---|---|
| Box | `rgba(20, 20, 22, 0.78)`, no border, square corners |
| Height | 15px: 1px padding top and bottom, 13px line |
| Side padding | 6px left and right |
| Text | `#ebe5d6` (`--paper`), uppercase |
| Font | the system monospace (`--mono`: ui-monospace, SF Mono, Menlo, Consolas, Courier New): Consolas in Chrome on Windows, SF Mono on macOS, DejaVu Sans Mono or Liberation Mono on Linux |
| Size | 11px, weight 400, letter spacing 0.08em (0.88px) |
| A Consolas letter | 6.05px plus 0.88px spacing: 6.93px a letter, cap height about 7px |
| Where | its bottom center 2.1 m over the player's feet, seen through walls |
| Distance | whole up to 20 m, fading to 35% at 80 m and beyond (`NET.nameplateFade`) |

Sizes are CSS pixels: twice as many device pixels on a HiDPI screen.

## The icon

- **Frame:** 11×11px, `viewBox="0 0 11 11"`, centered in the 13px line (1px clear above and below).
- **Place:** 5px after the name (its last letter's 0.88px spacing makes it about 6px, like the side padding); the tag's 6px padding after it.
- **Color:** one. The SVG is only a shape (any opaque color, e.g. `stroke="#000"`): the game paints it `--paper` through a CSS mask.
- **Lines:** 1px on the pixel grid (coordinates at .5 for strokes), no half-pixel edges; the HUD's thin body-cam lines, like its frame corners.
- **Reads** at 11px and at 35% opacity, over paper, ink, night and paint.

## The six

One shows at a time, the first that applies:

| File | Status | When |
|---|---|---|
| `note-dropped.svg` | Disconnected | their link is gone; they may come back (SERVER.rejoinWindow) |
| `note-silent.svg` | No signal | nothing from them for NET.silentAfter s |
| `note-away.svg` | Away | their game is hidden: minimized, another tab |
| `note-menu.svg` | In the menu | paused: the ESC menu or any of its pages (Settings…), F3 |
| `note-idle.svg` | Idle | playing, nothing pressed for NET.idleAfter s (60) |
| `note-lagging.svg` | Lagging | shown far behind (NET.highDelay) for a while |

Disconnected and no signal also draw the figure faded and slumped; away, head down.
