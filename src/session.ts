// Single player, or a multiplayer session (net/multiplayer.ts sets it). Build
// mode and the F3 panel exist only in single player (src/dev/devtools.ts).

export const session = {
  multiplayer: false,
  /** JOIN or HOST is under way and the session's paint hasn't loaded: the game can't be played yet (play-state.ts). A reconnect isn't joining. */
  joining: false,
  /** This player's key: what they own (their stepladder); in a session, from the id the server gave them. */
  player: 'local',
};
