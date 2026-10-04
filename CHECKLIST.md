# Props checklist (branch `fixes`)

Legend: `[x]` done · `[ ]` open · **DECIDE** = waiting on your call.

## Done

- [x] Debug panel: dark sheet, paper-colored text and controls
- [x] INK.paper default `#d2cab6`
- [x] **Sign lettering bypasses the light.** Hidden issue confirmed: lettering went through the ink tone, so a sign in shadow or at night turned solid black and its glyphs disappeared. It depended on the lighting, which is why a rebuild seemed to fix it. Now materials using the glyph atlas get a `LETTERS` define: ink where the glyph is dark, paper elsewhere, fading with distance, and paint still goes over it. Other surfaces are unchanged and pay nothing extra. No other props were touched.
- [x] Modular pipes: `Pipe run`, `Pipe corner`, `Pipe from floor`, `Pipe from wall`, `Pipe into roof`. Each one ends its pipe 1 m from its origin at 0.35 m height, so they chain on the 0.5 m grid. Equipment category.
- [x] Utility box: always red because its top cap reached 2 cm into the wall. Fixed.
- [x] Wall with an open door, opening outward (`Door (open)`, structure)
- [x] Floor hatch (access); curb and lid both paintable
- [x] Drain pipe: a wall downpipe one storey high. Stacked pipes join, with the shoe only at the bottom and the hopper only at the top.
- [x] Half block: 2 × 2 m, 2 m high, stacks by 2 m (small `vSnap` addition to cell placement)
- [x] Wall ledge: the ledge strip is now paintable (it was decor, below the 0.5 m size rule)
- [x] Sign tower / lattice mast / billboard couldn't go on floors: upright rod colliders reached 5 cm below their foot into the floor. Upright rods now end at their end points. This also fixes "billboard sometimes can't be placed".
- [x] Utility pole removed (not used in `demo.json`)
- [x] New **Signs** category (keys now 1-7): wall sign, shop sign, blade sign, sign tower, billboard, plus new small signs: Exit, High voltage, No entry, Name plate
- [x] Modular cables: `Floor cable`, `Floor cable corner` (45° cut), `Cable floor to wall`, `Wall cable` (stacks per storey). They chain end to end like the pipes. No colliders, so you walk over them. Details category.
- [x] Corner prop removed, with its 4 uses in `demo.json` (joint posts already close those corners) and the now unused `vertex` placement
- [x] Smaller parts paintable: vent shaft hood and cap, large AC skid, parapet coping (on the pieces and their joint posts). Same base texture as the bodies, so they join the existing paint mesh: no extra draw calls.

## Skipped / notes

- [ ] ~~Slope / wedge block~~ skipped by decision
- [ ] **DECIDE – Vertical parapet.** Not clear what you mean. Is it (a) a parapet hung on a wall face like a balcony rail, (b) a coping that wraps over a roof edge and down the side, or (c) something else?
- [ ] **NOTE – Pipe from wall** sits flush on any wall. Off building-block faces (which lie on the grid) the run continues on the 0.5 m grid. Off thin wall props the face is 0.15 m off the grid, so the next straight piece can't line up exactly. Same for `Cable floor to wall`.
- [x] Small signs: real words (`render/ink/words.ts`: EXIT, HIGH VOLTAGE, and name plates picked per instance from ROOF ACCESS / STAFF ONLY / ELECTRICAL / KEEP CLEAR / PLANT ROOM / FIRE DOOR / MAINTENANCE / DANGER). No entry is now a crossed-out person. About 20% smaller and paintable. AGENTS.md updated: small signs use real words.
- [x] Drain pipe flashing paint: the moon shadow box moved in 1 m world steps, which shift shadows by part of a texel. The pipe's thin shadow on the wall shimmered, toggling the paint behind it between lit and hatched. Now snapped to whole shadow texels in light space, which steadies every moon shadow. **Please confirm in the game**: I couldn't reproduce the flash headless.
