# Mouse spikes snap the camera (BL-010)

Mouse spikes on Chrome/Windows.

## BL-010 Mouse spikes snap the camera (Chrome on Windows)

Blocked by: the owner's decision; Status: Blocked, priority Medium, size S

A profile on Windows 11, Chrome 154: during a fast flick, one `mousemove` of 458 px among events of at most 123 px (one frame with none, then three at once); the camera jumped 60°. The frame took 16.7 ms: a bad input value, not a stall. Once in 42 minutes, 14 s after the lock was taken. `src/input.ts` adds every `movementX/Y` as it comes; unchanged since 1.0.

Known: a Chromium bug on Windows since at least 2017 (Chrome 62, jumps of 300–400 px, crbug 781182: [three.js #12757](https://github.com/mrdoob/three.js/issues/12757)), still reported in 2023 and 2025 (100–300 px in the direction of the move, Chrome, Edge and Opera on Windows, mostly with 1000 Hz mice, rare at 125 Hz: [three.js #27040](https://github.com/mrdoob/three.js/issues/27040), [t2-mapper #7](https://github.com/exogen/t2-mapper/issues/7)); closed as a device issue no engine can fix. A second kind: one huge value right after the lock is taken ([world PR #31](https://github.com/kathirmeyyappan/world/pull/31) drops motion for 150 ms after a lock change and events over 400 px). `requestPointerLock({ unadjustedMovement: true })` ([web.dev](https://web.dev/articles/disable-mouse-acceleration), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock)) turns off OS acceleration; no source says it ends the spikes, and it changes the feel for players used to acceleration.

Do: in `input.ts`, drop one event over 300 px (config) that is also over 3× the largest of the last ~8, and motion in the 100 ms after the lock is taken; count what's dropped in the profiler's report. A fixed cap alone would drop real flicks of 125 Hz mice at high DPI (those build up over several events, so the relative rule keeps them). Test with synthetic `MouseEvent`s: a flick passes, a lone 458 px among 60–120 px is dropped, a ramp of 250–350 px passes. Maybe later a RAW MOUSE setting (`unadjustedMovement`, off by default, with the fallback).

Second profile (2026-10-23, Windows 11, Chrome 155, 1920×1080, RTX A2000 laptop, 33 min, 4 mouse spikes, all at a steady 60 fps):

| at | event (dx, dy) | camera | frame before |
| --- | --- | --- | --- |
| 192.5 s | −97, −381 | 49.6° | 0 events |
| 276.8 s | ~34, −383 | 48.5° | 0 events |
| 399.5 s | 256, +381 | 39.8° (pitch hit the −89° stop) | 1 event |
| 1300.7 s | 61, +381 | 48.6° | 0 events |

- **The vertical part is the same each time: 381–383 px, up twice and down twice.** Only dx differs. Random noise would not repeat a value. This looks like a fixed distance in the browser or OS (a cursor re-centering for the lock?), not a loose sensor value. The first profile's 458 px may be the same: here one of 458.75 is 256 by 381.
- Each comes as 2–3 events in one frame, usually after a frame with none. It is not a stall (16.7 ms frames), not at the lock (65 s, 7 s, 130 s and 890 s after it), and not near a lock change.
- Rate: about once in 8 minutes here, against once in 42 minutes before.
- Not known yet: whether the browser produced it or the OS did, and whether `unadjustedMovement` ends it.

Diagnostics now in the profile (this section's next step): a mouse spike keeps `trail`, the raw events of the last frames as three listeners saw them (`mouse` = mousemove, `pointer` = pointermove with its `coalesced` events, `raw` = pointerrawupdate), each with `ago` (ms before the frame ended) and `lag` (the page's delay after the event's own time stamp), and the reason says how long after the lock it came. Reading it: the 381 in `raw` too means the OS sent it; only in `mouse` means the browser built it; a big `lag` or equal time stamps mean events held up and let go together.

Test switch (decided 2026-10-23: F3 only until the cause is found): Player → Camera → raw mouse (`PLAYER.rawMouse`, off by default) asks the next pointer lock for `unadjustedMovement`; close F3 and click to resume for it to apply, and a browser that refuses it gets the plain lock. A profile's browser events say `pointer lock taken (raw mouse)` when it applied. To do: one profile of 30+ minutes with it off (the usual rate is about one spike in 8 minutes) and one with it on, same mouse. No spikes with it on, and some with it off, means the OS-side adjustment makes them, and it can become a player setting; spikes in both means a drop rule (a 300 px event that is also 3× the recent largest would have caught all four).

Blocked (2026-10-14): the owner decides between the drop rule, a RAW MOUSE setting, both or nothing, after looking into it. To reproduce first: (1) a test feeding synthetic `mousemove`s with the profile's numbers (one 458 px among 60–120 px) shows the 60° snap; (2) a counter of events over 300 px in the F3 profiler (time since the lock, size, the events around it), and a session on Windows with a 1000 Hz mouse, to see how often it happens.
