# Design brief: hints in play (and the game's messages)

For the designer; no code knowledge needed. Owner's background: `docs/ideas/tutorial.md` (BL-092) and `docs/ideas/notifications.md` (BL-140).

## What and why

Hidden Roof is a first-person graffiti game in a body-cam look: the world is ink on paper, and the only color is the paint players spray. Today a new player gets no help with the controls; the full key list sits in Settings → Controls. We want short hints in play instead: "how to move" in the first seconds, "how to use it" when a new tool is picked up, "how to switch color" when there's a second color, "how to climb" next to a ladder. A hint appears when it's needed and goes once the player has done it; learnt hints never come back.

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

## Constraints

- **Monochrome body-cam.** HUD is ink and paper with one red for alerts. No new hues: color belongs to the paint. (The ESC menu added a green dot and a second red; the HUD must not.)
- **Readable over anything:** white walls under a lamp, black paint, any of 13 paint colors, the night sky, rain. Hints sit over paint all the time.
- **Windows from 820×560 up to 4K and ultrawide (21:9, 32:9).** The HUD is sized in CSS pixels and stays so in this task: design at fixed px for 1280×720 and check they hold at 820×560. Scaling with the window and the DPR is a later, separate task (TASK-197); ideas for it are welcome but not part of this delivery.
- **Keys are rebindable**, and named for the platform and keyboard layout: `W` may be `Z`, `Shift` is `⇧ Shift` on a Mac, a key may be a mouse button (`LMB`, `RMB`, `MMB`, `Mouse 4`), a wheel step (`Wheel ↑`) or unbound (`—`). Key-cap widths change; texts get longer or shorter.
- **Nothing over the crosshair** (screen center), **the hotbar** (bottom center) or **the tool-hand cluster** (follows the tool, right of center, lower half). A hint never covers what it teaches.
- **The game is fast.** No video, no blur over the moving game for every message; CSS transitions and a few elements are fine.
- **One hint at a time.** A more important one (a new tool) takes the place of a waiting one, which comes back after.
- **A picked-up tool:** its hint replaces the "+ MARKER" toast; the NEW TOOL tag on the pickup stays. With hints off in Settings the toast shows as today.
- **English only.**
- **Proposed place for hints:** the lower left third, left of the hotbar. Context hints may instead hang on their object in the world (like the pickup tags). Your call.

## What to draw

1. **Hint kinds:** a basic hint (move, spray), a new-tool hint (two steps: "[2] take the marker", then "[LMB] draw · [Q] [E] nib"), a context hint (by a ladder), a hint pointing at a hotbar slot.
2. **States:** appearing, waiting (shown a while, player hasn't done it: quieter?), done (a short acknowledgement before it leaves), deferred (a more important one took its place), leaving without done (walked away from the ladder).
3. **Key caps:** a key, a long key (`⇧ Shift`, `Space`, `Page Down`), a pair (`[Q] [E]`), four keys (`[W][A][S][D]`), mouse buttons and the wheel (icons or words?), an unbound key.
4. **One line and multi-line hints;** the longest realistic one: "walk into it or hold [SPACE] to climb · [CTRL] hold on".
5. **One replacing another:** a new-tool hint arriving while the move hint waits.
6. **With the rest of the HUD:** a hint while the PSI gauge and LOW PRESSURE are up, while a toast shows, while the hotbar changes, near the crosshair's zone.
7. **Messages (BL-140), same system:** event toast (one, a stack of three), the status chip (reconnecting, in play), a blocking error ("you're playing alone now; your paint is kept"), their places in play and on the ESC menu.
8. **At 1280×720 and 820×560** (the 4K and ultrawide shots show where scaling will matter later).

## Questions for you

1. Hints in the HUD's monospace capitals, or a sentence-case face like the menu's Archivo?
2. A backing (a dark box like the nameplates, a paper tape, an outline) or bare text with a halo?
3. Mouse buttons and the wheel: words in key caps, or small icons?
4. Should a hint point at its target (a line to the hotbar slot, the ladder), or only sit near it?
5. Katakana under the text, as on the pickup tags, or not for hints?
6. The red: only for alerts, or also for "done"?
7. How the hint and toast hold at 820×560 (later scaling is TASK-197).
8. The tool-hand cluster runs off the right edge in small windows: flip it left, or wrap?
9. Toasts: where, if hints take the lower left (above the hotbar as now, or top)?

## What to deliver

- Mockups over the screenshots above (or new ones the owner takes), at 1280×720 and 820×560.
- Each kind in each state, with timings: fade in, wait, done, out (ms), easing.
- Sizes in px at 1280×720; spacing, paddings, stroke widths.
- Key-cap component: all variants from point 3.
- Colors and opacities as values from the palette above.
- Zones: a screen map with where each kind lives and the no-go areas.
- Optional: a short motion clip of a hint going from waiting to done.
