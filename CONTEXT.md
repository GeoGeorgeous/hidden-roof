# Context

The game's words, as the code uses them. Architecture terms (module, interface, seam, depth) are in the mattpocock-skills `codebase-design` vocabulary.

## Paint

- **Paint surface**: a prop's paintable faces sharing one paint atlas (`PaintSurface`, `src/painting.ts`), named by a key (`p<prop id>#<n>`, `j<joint>#<n>`) that is the same on every client and the server.
- **Face** (rect): one flat face of a paint surface, a rect in its atlas. A **face point** (rect, u, v) names a spot on it at any paint detail.
- **Paint detail**: texels per meter of paint (LOW 24, MEDIUM 48, HIGH 72, ULTRA 96). A player's setting, held at the host's in a session. Surfaces keep the detail they were built at (`SurfaceGeometry.texelsPerMeter`), and paint on them is measured in it; `PAINT.texelsPerMeter` only says what the next build uses.
- **Paint op**: one stamp, roll or drip run as data (`src/paint-ops.ts`), every number rounded as it travels (`rounded`, `src/op-wire.ts`). One made here is **recorded** (counted, logged as this player's); one made elsewhere is **replayed** (painted, never logged, never starting runs).
- **Level plan**: a level's props as loaded, the same in the game and on the server (`planLevel`, `src/level/prop-pieces.ts`): instances by id, their pieces, the cover index of their solid boxes. The game builds meshes from it; the server only its paint surfaces.
- **Open level**: the level being played (`OpenLevel`, `src/level/open-level.ts`): its name, the level as a file (`LevelData`, checked by `levelProblem` in `src/level/level-data.ts` for a file, a fetch and a HOST alike), and what opening or restarting it does.
- **Paint file**: paint only, as faces (`.rhhpaint`, `src/save/paint-file.ts`): a save, a level's own paint, a session's join snapshot.

## Multiplayer

- **Session**: a game on one level shared through the server, under a code; players HOST or JOIN it (`src/net/multiplayer.ts`, `server/session.ts`).
- **Server link**: one WebSocket to the server for one HOST or JOIN (`ServerLink`, `src/net/server-link.ts`): the hello, keepalive, giving up before the welcome, a paint file's parts. A dropped player comes back on a new link with their token.
- **Lobby**: who gets into which session on the server (`server/lobby.ts`): live and ended session codes, each address's links and uploads, HOST and JOIN, and each link's messages to its session. It speaks only `Link`; `server/main.ts` gives it WebSocket links, the tests fake ones.
- **Welcome**: the server's answer to HOST or JOIN: the level, its paint detail, the players, and the session's paint as a paint file in parts.
