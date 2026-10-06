// Single player, or a multiplayer session. Build mode and the F3 panel exist
// only in single player (src/dev/devtools.ts). Until the MULTIPLAYER menu
// exists, ?session starts an offline session, for testing.

export const session = {
  multiplayer: new URLSearchParams(location.search).has('session'),
};
