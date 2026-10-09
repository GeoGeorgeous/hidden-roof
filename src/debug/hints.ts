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
  RECORD: 'Record your movement and painting until you press STOP.',
  profiling: 'Whether profiling mode is recording (F8 starts and stops it, F9 probes, F2 marks a spike you saw; ?profile in the address starts it with the game).',
  PROFILE: 'Start profiling mode, or stop it and download the report (JSON). Same as F8. Play as usual while it records: each second\'s frame times, CPU time per part of the frame, GPU time per pass, draw calls, lights and where you stood.',
  PROBE: 'Stand still: turns systems off one at a time (city, props, shadows, lights, half resolution…) and measures what each costs from here, about 45 s. Same as F9; starts profiling if it isn\'t on, and lands in its report.',
  'PLAY (LOOP)': 'Play the recording back as a ghost, over and over, through the fake network below.',
  'FOLLOW ME': 'The ghost copies you live, a few seconds behind (follow: delay), through the fake network.',
  STOP: 'Stop recording, playing or following.',
  preset: 'Sets of paper, ink, sky and cloud colors to switch between live: NM, OM and RL are the pause menu\'s GRAPHICS → STYLE (NEW MANGA, OLD MANGA, RETRO LIGHT; INK_STYLES), 1–4 F3 only (INK_PRESETS). Edits stay with the picked set until reload; COPY gives every set as it shows.',
  REBUILD: 'Build the city again with the settings above (seed, sizes): a moment\'s work.',
  'caption: font': 'Font of a pickup tag\'s caption (NEW TOOL): the HUD\'s mono, the neon signs\' heavy Japanese gothic, or the menu title\'s graffiti.',
  'name: font': 'Font of a pickup tag\'s name (MARKER): the HUD\'s mono, the neon signs\' heavy Japanese gothic, or the menu title\'s graffiti. The katakana is always gothic.',
  showing: 'The test figure\'s pose now (number / count, name), or hidden.',
  'SHOW / HIDE': 'Put the test figure in front of you, or take it away.',
  'PREVIOUS POSE': 'The test figure shows the pose before this one.',
  'NEXT POSE': 'The test figure shows the next pose.',
  'CYCLE POSES': 'The test figure goes through every pose in turn.',
  position: 'Player feet position (x, y, z).',
  speed: 'Horizontal speed (m/s).',
  vertical: 'Vertical speed (m/s); negative = falling.',
  state: 'Grounded, airborne, crouched, on ladder or flying (build mode).',
  'STRIKE NOW': 'Trigger a lightning strike right now (thunder follows).',
  fps: 'Frames per second, and CPU time per frame.',
  'gpu: scene': 'GPU time of the main scene pass (needs timer queries; desktop Chromium).',
  'gpu: volumetrics': 'GPU time of the volumetric light pass.',
  'gpu: hands + post': 'GPU time of the hands, tools and the final pass (outlines, paper, brightness).',
  'draw calls': 'Draw calls in the main scene pass. Should not grow with paint.',
  'real lights': 'Real spot lights in use: moving CCTV lights (every near lamp with baking off).',
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
