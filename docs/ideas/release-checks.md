# Device checks for 1.4.0 (BL-013)

The owner's checks by hand that the audit of 2026-10-17 left open. Rule (decided 2026-10-17): the release waits for every pre-release check to pass or be explicitly postponed; the post-release ones run on production, and a failure there is a 1.4.1 patch. How to set up two players, a weak link or other devices: `docs/testing.md`.

Already passed on next (2026-10-18, RTX laptop, Chrome): wheel and Q/E per tool, typing fires no game keys, background tab, rejoin within 3 minutes, spray/shake exclusive, the WebGL message, joining a painted session, a slow link, strokes over a dropped link, tank roofs solid, remote corrections, the full multiplayer pass.

## Before the release (this machine)

- **Page zoom at 67%.** Performance lines on. Chrome Settings → Appearance → Page zoom: 67%, reload, compare fps with 100%; toggle fullscreen. Expect about the same fps at 67% as at 100%. (Ctrl +/− are blocked in game since BL-023.)
- **Packed paint looks the same in Chrome, Firefox and Edge.** Every tool, every cap and drips on one wall; SAVE PAINT in two browsers and compare; performance lines: download per painter. Expect screens and saves to match, about 5 KB/s down per painter.
- **ESC menu in Chrome, Firefox and Edge.** Fullscreen; Esc on the pause screen tapped and held; EXIT FULLSCREEN held; HOST name field + Enter; window at 1366×768 and small. Expect: Firefox has no keyboard lock, so in fullscreen one Esc leaves fullscreen and doesn't resume, no rings, EXIT FULLSCREEN leaves at once; windowed, Esc on the pause screen resumes and PLAY shows its ESC key. Chromium: tap resumes, held 1.5 s the rings fill and it leaves. Enter hosts; the menu fits at 1366×768 and at 820×560.
- **Mouse back/forward buttons** (Windows, a mouse with side buttons). Playing, press back then forward; also in the menu. Expect nothing to happen, no leave-page prompt.
- **Browser keys while playing** (Windows Chrome). Windowed and in game fullscreen: Ctrl+W, Ctrl +/−/0, Ctrl+wheel, pinch, F5, F11, Ctrl+R; Firefox: / and Alt. In the menu: Ctrl +/−/0, Ctrl+wheel, pinch. Expect: zoom never changes; Ctrl+W does nothing while playing (windowed without the lock: the leave prompt); F5 and Ctrl+R ask to reload; F11 leaves or enters fullscreen at once, in game fullscreen too; no find bar or menu bar.
- **Since 2026-10-18** (input now goes through one path; joining's progress; the sponge frees memory). Chrome, two browsers in one session:
  - keys, mouse buttons and the wheel in play and in the menu: wheel and Q/E per tool, a rebound key, Shift either side
  - join a painted session: the menu shows Loading N% (or Joining…) instead of PLAY; LEAVE cancels, and joining again works
  - sponge a wall clean in one browser, then spray it again in the other: both screens match
- **Every release:** walking along railings and landings (the corner slip, `PLAYER.cornerSlip`), the lattice mast (can't be climbed), the clear windows (see through, paint from both sides, a stepladder against one from behind), pickups (ring shapes, glow, tags within 4 m, hidden behind walls).

## After the release (production)

- **MacBook Retina:** page zoom check for sharpness.
- **Stepladder near lamps on the Intel laptop:** performance lines on, place and move the ladder 10 times near lamps. Expect no hitch (BL-107).
- **MacBook trackpad and a high-resolution wheel:** can in hand, one gentle two-finger swipe, one wheel notch; write down how many colors each moves (BL-135).
- **The server after the deploy:** HOST, paint, everyone leaves, HOST again at once. Expect no "the server is full", and `docker top` shows `node --expose-gc main.js`.
- **Safari and Firefox on the Mac:** the packed-paint and ESC menu checks above; Mac: hold W, Cmd+Tab and back, expect you stop walking.
