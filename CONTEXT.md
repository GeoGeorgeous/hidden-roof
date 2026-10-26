# Context

The game's words, as the code uses them.

## Paint

- **Paint surface**: a prop's paintable faces sharing one paint atlas (`PaintSurface`, `src/painting.ts`), named by a key (`p<prop id>#<n>`, `j<joint>#<n>`) that is the same on every client and the server.
- **Face** (rect): one flat face of a paint surface, a rect in its atlas. A **face point** (rect, u, v) names a spot on it at any paint detail.
- **Paint detail**: texels per meter of paint (LOW 24, MEDIUM 48, HIGH 72, ULTRA 96). A player's setting, held at the host's in a session. Surfaces keep the detail they were built at (`SurfaceGeometry.texelsPerMeter`), and paint on them is measured in it; `PAINT.texelsPerMeter` only says what the next build uses.
- **Paint op**: one stamp, roll or drip run as data (`src/paint-ops.ts`), every number rounded as it travels (`rounded`, `src/op-wire.ts`). One made here is **recorded** (counted, logged as this player's); one made elsewhere is **replayed** (painted, never logged, never starting runs).
- **Level plan**: a level's props as loaded, the same in the game and on the server (`planLevel`, `src/level/prop-pieces.ts`): instances by id, their pieces, the cover index of their solid boxes. The game builds meshes from it; the server only its paint surfaces.
- **Open level**: the level being played (`OpenLevel`, `src/level/open-level.ts`): its name, the level as a file (`LevelData`, checked by `levelProblem` in `src/level/level-data.ts` for a file, a fetch and a HOST alike), and what opening or restarting it does.
- **Paint file**: paint only, as faces (`.rhhpaint`, `src/save/paint-file.ts`): a save, a level's own paint, a session's join snapshot.

## Multiplayer

- **Session**: a game on one level shared through the server, under a code. The admin makes it, **public** (open to all from the server list, up to 20 players, kept with its paint) or **private** (joined with its code, up to 4, in memory only); players JOIN it (HOST, their own private one, is off: `SERVER.playerHost`). `src/net/multiplayer.ts`, `server/session.ts`.
- **Line** (queue): the players waiting for a place in a full session, in order (`server/queue.ts`); a dropped link keeps its place for `SERVER.rejoinWindow`.
- **Kept paint**: a public session's paint saved on the server's disk (`server/kept.ts`) and made again at start; the admin's wipe sets the newest saves aside, never loaded.
- **Server link**: one WebSocket to the server for one HOST or JOIN (`ServerLink`, `src/net/server-link.ts`): the hello, keepalive, giving up before the welcome, a paint file's parts. A dropped player comes back on a new link with their token.
- **Lobby**: who gets into which session on the server (`server/lobby.ts`): live and ended session codes, each address's links and uploads, HOST and JOIN, and each link's messages to its session. It speaks only `Link`; `server/main.ts` gives it WebSocket links, the tests fake ones.
- **Welcome**: the server's answer to HOST or JOIN: the level, its paint detail, the players, and the session's paint as a paint file in parts.

## Play

- **Play state**: playing (the pointer locked to the game), paused behind the menu, F3's panel open, build mode, in a session (`PlayState`, `src/play-state.ts`): whether the game is **frozen** (paused in single player) and what Esc and Enter do. The lock itself is Input's (`Input.setLocked`: the browser's pointer lock, or a test's).
