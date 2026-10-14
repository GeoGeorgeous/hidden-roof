# Context

The game's words, as the code uses them. Architecture terms (module, interface, seam, depth) are in the mattpocock-skills `codebase-design` vocabulary.

## Paint

- **Paint surface**: a prop's paintable faces sharing one paint atlas (`PaintSurface`, `src/painting.ts`), named by a key (`p<prop id>#<n>`, `j<joint>#<n>`) that is the same on every client and the server.
- **Face** (rect): one flat face of a paint surface, a rect in its atlas. A **face point** (rect, u, v) names a spot on it at any paint detail.
- **Paint detail**: texels per meter of paint (LOW 24, MEDIUM 48, HIGH 72, ULTRA 96). A player's setting, held at the host's in a session. Surfaces keep the detail they were built at (`SurfaceGeometry.texelsPerMeter`), and paint on them is measured in it; `PAINT.texelsPerMeter` only says what the next build uses.
- **Paint op**: one stamp, roll or drip run as data (`src/paint-ops.ts`), every number rounded as it travels (`rounded`, `src/op-wire.ts`). One made here is **recorded** (counted, logged as this player's); one made elsewhere is **replayed** (painted, never logged, never starting runs).
- **Paint file**: paint only, as faces (`.rhhpaint`, `src/save/paint-file.ts`): a save, a level's own paint, a session's join snapshot.
