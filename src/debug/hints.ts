import { HINTS } from './hint-text';

// Tooltip lookup for the debug panel: config paths (hint-text.ts) and the
// labels of actions and readouts.

/** Tooltip for a config path, if there is one. */
export function hintFor(path: string[]): string | undefined {
  const keys = path.filter((k) => !/^\d+$/.test(k));
  if (keys[0] === 'DAYLIGHT') {
    const h = HINTS[keys.join('.')] ?? HINTS[['ATMOS', ...keys.slice(1)].join('.')];
    return h && `Build-mode daylight. ${h}`;
  }
  const exact = HINTS[keys.join('.')];
  if (exact) return exact;
  // A name after the first may be `*` (CAPS.*.strength, PICKUP.models.*.size, NEON_COLORS.*).
  for (let i = 1; i < keys.length; i++) {
    const h = HINTS[[...keys.slice(0, i), '*', ...keys.slice(i + 1)].join('.')];
    if (h) return h;
  }
  return undefined;
}

/** Tooltips for actions and readouts, by label. */
export const LABEL_HINTS: Record<string, string> = {
  ghost: 'What the ghost (a recorded you, shown as another player) is doing.',
  'shown behind them': 'How far behind the ghost\'s newest snapshot it is shown, to smooth over the network (ms).',
  'jitter measured': 'How unevenly its snapshots arrive (ms); the delay above grows with it.',
  'snapshots buffered': 'Snapshots waiting to be shown.',
  guessing: 'YES while no newer snapshot has come and the ghost keeps going the way it went.',
  'correction gliding': 'How far the ghost is still gliding back after a wrong guess (cm).',
  'most build-up': 'The most wet paint the wet view finds near you, in coats, against the build-up needed to run (it stops just under it: a spot that reaches it may run, and its wet paint starts over). Only while the wet view is on.',
  RECORD: 'Record your movement and painting until you press STOP.',
  profiling: 'Whether profiling mode is recording (F8 starts and stops it, F9 probes, F2 marks a spike you saw; ?profile in the address starts it with the game).',
  PROFILE: 'Start profiling mode, or stop it and download the report (JSON). Same as F8. Play as usual while it records: each second\'s frame times, CPU time per part of the frame, GPU time per pass, draw calls, lights and where you stood.',
  PROBE: 'Stand still: turns systems off one at a time (city, props, shadows, lights, half resolution…) and measures what each costs from here, about 45 s. Same as F9; starts profiling if it isn\'t on, and lands in its report.',
  'PLAY (LOOP)': 'Play the recording back as a ghost, over and over, through the fake network below.',
  'FOLLOW ME': 'The ghost copies you live, a few seconds behind (follow: delay), through the fake network.',
  STOP: 'Stop recording, playing or following.',
  preset: 'Sets of paper, ink, sky and cloud colors to switch between live: NM, OM and RL are the pause menu\'s GRAPHICS → STYLE (NEW MANGA, OLD MANGA, RETRO LIGHT; INK_STYLES), 1–4 F3 only (INK_PRESETS). Edits stay with the picked set until reload; COPY gives every set as it shows.',
  REBUILD: 'Build the city again with the settings above (seed, sizes): a moment\'s work.',
  'caption: font': 'Font of a pickup tag\'s NEW TOOL: the HUD\'s mono, the neon signs\' heavy Japanese gothic, or the menu title\'s graffiti. Its Japanese is always in the gothic.',
  'name: font': 'Font of a pickup tag\'s name (MARKER): the HUD\'s mono, the neon signs\' heavy Japanese gothic, or the menu title\'s graffiti. Its Japanese is always in the gothic.',
  showing: 'The test figure\'s pose now (number / count, name), or hidden.',
  'SHOW / HIDE': 'Put the test figure in front of you, or take it away.',
  'PREVIOUS POSE': 'The test figure shows the pose before this one.',
  'NEXT POSE': 'The test figure shows the next pose.',
  'CYCLE POSES': 'The test figure goes through every pose in turn.',
  position: 'Player feet position (x, y, z).',
  speed: 'Horizontal speed (m/s).',
  vertical: 'Vertical speed (m/s); negative = falling.',
  state: 'Grounded, airborne, crouched, on ladder or flying (build mode).',
  'UNLOCK ALL': 'Every tool, paint color and cap at once; their pickups go, as if collected. Lasts until a level loads (a page reload, a level opened in build mode).',
  'STRIKE NOW': 'Trigger a lightning strike right now (thunder follows).',
  fps: 'Frames per second, and CPU time per frame.',
  'gpu: scene': 'GPU time of the main scene pass (needs timer queries; desktop Chromium).',
  'gpu: volumetrics': 'GPU time of the volumetric light pass.',
  'gpu: hands + post': 'GPU time of the hands, tools and the final pass (outlines, paper, brightness).',
  'draw calls': 'Draw calls in the main scene pass. Should not grow with paint.',
  'real lights': 'Real spot lights in use: moving CCTV lights (every near lamp with baking off).',
  'random hint': 'Shows a random hint of the catalogue, with your key names. The tutorial\'s own hint waits until you clear it.',
  hint: 'Shows this hint (same as above, picked). Press again to change; CLEAR HINT removes it.',
  'clear hint': 'Takes the test hint off: the tutorial\'s own comes back.',
  overlay: 'The gradient behind a hint: auto as in play, always shows it without a hint, never hides it.',
  reconnecting: 'Shows the reconnecting status; each press adds an attempt.',
  'no signal': 'Shows the no-signal status (it replaces the status showing, as in play).',
  'bad connection': 'Shows the bad-connection status.',
  'clear status': 'Takes the status off and starts the attempts over.',
  'toast: Geo joined': 'A toast: Geo joined.',
  'toast: random joined': 'A toast: a random name joined.',
  'toast: left': 'A toast: a random name left.',
  'toast: pickup': 'A toast: you picked up a random item.',
  reconnected: 'Shows the reconnecting status, then its success: the check and "Reconnected" for a moment.',
  'server lost': 'The dialog of a reconnect that ran out of time: grows out of the reconnecting status if one shows. Test only: its button just closes it.',
  'session ended': 'The dialog of a session the server closed (it restarted). Test only: its button just closes it.',
  'session empty': 'The dialog of a session the server closed because everyone left and no one came back in time. Test only: its button just closes it.',
  'opened elsewhere': 'The dialog of the same player joining from another tab. Test only: its button just closes it.',
  updated: 'The dialog of a new version on the server. Test only: its button just closes it, no reload.',
  'session full': 'The dialog of a session that filled up while you reconnected. Test only: its button just closes it.',
  'server busy': 'The dialog of a server that is full or turned your network away. Test only: its button just closes it.',
  'network error': 'The dialog of an error in the session, with a made-up error to copy. Test only: its button just closes it.',
  'client error': 'The crash card, with a made-up stack, without crashing anything. Test only: its button just closes it.',
  'baked light': 'Memory of the light textures, and time the bake took this frame.',
  bake: 'Parts of the level still waiting for their light (after an edit or a light tweak).',
  triangles: 'Triangles drawn in the main scene pass.',
  'paint tex': 'Paint textures created so far / paintable surfaces.',
  'tex memory': 'Memory used by paint textures.',
  uploads: 'Paint rects uploaded to the GPU this frame (only what changed: a few rects per texture, PAINT.dirtyRects, one call each).',
  particles: 'Spray particles in flight.',
  'paint ops / s': 'Stamps, roller presses and paint runs made per second (last second). Each one goes into paint saves and, in a session, over the network: tighter stroke spacing makes more.',
  'paint runs': 'Paint runs moving right now.',
};
