// Tiny line icons for the F3 panel: tabs, groups and sections. Drawn on a
// 10x10 grid in currentColor, so they sit at the 11px text size and follow its
// color. Group icons are named after the group's id.

const CUBE = '<path d="M5 .5 9 2.8v4.4L5 9.5 1 7.2V2.8zM1 2.8l4 2.3 4-2.3M5 5.1v4.4"/>';
const HAND = '<path d="M2.5 9.5V4a1 1 0 0 1 2 0V2a1 1 0 0 1 2 0v2.5a1 1 0 0 1 2 0V7a2.5 2.5 0 0 1-2.5 2.5z"/>';
const CAN = '<path d="M2.5 4h4v5.5h-4zM3.5 4V2.5h2V4M7.5 1.5l1.5-.8M7.5 2.8h1.7M7.5 4.1l1.5.8"/>';

const ICONS: Record<string, string> = {
  // Tabs
  player: '<circle cx="5" cy="3" r="2"/><path d="M1.5 9.5a3.5 3.5 0 0 1 7 0"/>',
  paint: '<path d="M5 .5C3.5 2.5 2 4.3 2 6.3a3 3 0 0 0 6 0C8 4.3 6.5 2.5 5 .5z"/>',
  look: '<path d="M.5 5C1.8 2.8 3.3 1.8 5 1.8S8.2 2.8 9.5 5C8.2 7.2 6.7 8.2 5 8.2S1.8 7.2.5 5z"/><circle cx="5" cy="5" r="1.4"/>',
  world: '<circle cx="5" cy="5" r="4.5"/><path d="M.5 5h9M5 .5c-2.4 2.6-2.4 6.4 0 9M5 .5c2.4 2.6 2.4 6.4 0 9"/>',
  collectables: CUBE,
  test: '<path d="M3.5.5h3M4 .5v3.2L1.2 8.6a.6.6 0 0 0 .5.9h6.6a.6.6 0 0 0 .5-.9L6 3.7V.5M2.6 6.5h4.8"/>',
  // Groups
  movement: '<path d="M1.5 2l3 3-3 3M5.5 2l3 3-3 3"/>',
  camera: '<path d="M.5 2.5h6v5h-6zM6.5 4.3 9.5 3v4L6.5 5.7"/>',
  avatar: '<circle cx="5" cy="1.8" r="1.3"/><path d="M5 3.1v3.2M2.5 4.5h5M5 6.3 3.3 9.5M5 6.3l1.7 3.2"/>',
  pickups: CUBE,
  hands: HAND,
  held: CAN,
  painting: CAN,
  pressure: '<path d="M.8 8a4.2 4.2 0 1 1 8.4 0M5 7.5l2-2.7"/><circle class="f" cx="5" cy="7.5" r=".9"/>',
  ink: '<path d="M5 .5 8 5 5 9.5 2 5zM5 5.4v4"/><circle cx="5" cy="4.6" r=".8"/>',
  lights: '<path d="M3.6 7.2C3.4 5.8 1.8 5.3 1.8 3.4a3.2 3.2 0 0 1 6.4 0c0 1.9-1.6 2.4-1.8 3.8zM3.8 9.3h2.4"/>',
  post: '<path d="M.5 1.5h9v6h-9zM3 9.5h4M5 7.5v2"/>',
  weather: '<path d="M2.7 6.3a1.9 1.9 0 0 1-.2-3.8 2.8 2.8 0 0 1 5.3.6 1.6 1.6 0 0 1-.2 3.2zM3 8l-.5 1.5M5.5 8 5 9.5M8 8l-.5 1.5"/>',
  props: '<circle cx="5" cy="5" r="4.5"/><path d="M5 5V1.8M5 5l2.8 1.6M5 5 2.2 6.6"/>',
  city: '<path d="M.5 9.5h9M1.5 9.5v-5h3v5M4.5 9.5v-8h4v8M6 3.5h1.2M6 5.5h1.2M6 7.5h1.2"/>',
  sound: '<path d="M.5 3.5h2l3-2.5v8l-3-2.5h-2zM7.2 3.6a2 2 0 0 1 0 2.8M8.6 2.2a4 4 0 0 1 0 5.6"/>',
  daylight: '<circle cx="5" cy="5" r="2"/><path d="M5 .5v1.2M5 8.3v1.2M.5 5h1.2M8.3 5h1.2M1.8 1.8l.9.9M7.3 7.3l.9.9M1.8 8.2l.9-.9M7.3 2.7l.9-.9"/>',
  performance: '<path d="M.5 5.5h2l1.5-4 2 7 1.5-3h2"/>',
  ghost: '<path d="M1.5 9.5v-5a3.5 3.5 0 0 1 7 0v5L7.3 8.4 6.2 9.5 5 8.4 3.8 9.5 2.7 8.4zM3.8 4.5v.6M6.2 4.5v.6"/>',
  // Sections
  pickup: CUBE,
  hand: HAND,
  can: CAN,
  ladder: '<path d="M2.5.5v9M7.5.5v9M2.5 2.5h5M2.5 5h5M2.5 7.5h5"/>',
  marker: '<path d="M1 9l.8-2.4 5-5a1 1 0 0 1 1.6 1.6l-5 5zM6 2.4 7.6 4"/>',
  roller: '<path d="M1.5 1h6.5v2.5H1.5zM8 2.2h1.3v3H5.2v1.3M4.6 6.5h1.2v3H4.6z"/>',
  sponge: '<path d="M.5 3h9v4.5h-9z"/><path class="dot" d="M2.5 4.8h0M4.5 5.8h0M6 4.6h0M7.8 5.6h0"/>',
  runs: '<path d="M.5 1.5h9M2.5 1.5v4M5 1.5V8M7.5 1.5V4"/>',
  cap: '<path d="M.5 5h2M2.5 3.5h2v3h-2zM5.5 4 9 2M5.5 5h3.5M5.5 6 9 8"/>',
  lightning: '<path d="M6 .5 2 5.5h3l-1 4 4-5H5z"/>',
  cctv: '<path d="M.8 2.2 7.5 4l-.7 2.5L.5 4.7zM5.6 6.2 5 8.5H2M2 7v2.5"/>',
  smoke: '<path d="M3 9.5C1.5 8 4.5 6.5 3 5S3 2 4.5.5M6.5 9.5C5 8 8 6.5 6.5 5S6.5 2 8 .5"/>',
  flicker: '<path d="M5 .5V3M5 7v2.5M.5 5H3M7 5h2.5M1.8 1.8l1.4 1.4M6.8 6.8l1.4 1.4M1.8 8.2l1.4-1.4M6.8 3.2l1.4-1.4"/>',
  moon: '<path d="M8.5 6.5a4.2 4.2 0 0 1-5-5 4.2 4.2 0 1 0 5 5z"/>',
  ambient: '<path d="M.5 7.5a4.5 4.5 0 0 1 9 0zM.5 9.5h9"/>',
  beams: '<path d="M5 .5 1 9.5M5 .5v9M5 .5l4 9"/>',
  grade: '<circle cx="5" cy="5" r="4.5"/><path class="f" d="M5 .5a4.5 4.5 0 0 1 0 9z"/>',
  vignette: '<path d="M.5 1.5h9v7h-9z"/><circle cx="5" cy="5" r="2"/>',
  hud: '<circle cx="5" cy="5" r="2.5"/><path d="M5 .5v2M5 7.5v2M.5 5h2M7.5 5h2"/>',
  page: '<path d="M2 .5h4l2.5 2.5v6.5H2zM6 .5V3h2.5"/>',
  tones: '<path d="M.5 .5h4v4h-4zM5.5 5.5h4v4h-4z"/><path class="f" d="M5.5.5h4v4h-4z"/>',
};

/** Section titles (lower case) to icons; the first match wins, none for "general". */
const SECTIONS: [RegExp, string][] = [
  [/^sponge pickup|^pickups/, 'pickup'],
  [/^sponge/, 'sponge'],
  [/hand/, 'hand'],
  [/^can$/, 'can'],
  [/^ladder$/, 'ladder'],
  [/^marker/, 'marker'],
  [/^roller/, 'roller'],
  [/^paint runs/, 'runs'],
  [/^paint/, 'paint'],
  [/^cap ·/, 'cap'],
  [/^lightning/, 'lightning'],
  [/^cctv/, 'cctv'],
  [/^smoke/, 'smoke'],
  [/fans/, 'props'],
  [/^flicker/, 'flicker'],
  [/^moonlight/, 'moon'],
  [/^ambient/, 'ambient'],
  [/daylight/, 'daylight'],
  [/light|glow/, 'lights'],
  [/^volumetrics/, 'beams'],
  [/grading/, 'grade'],
  [/^vignette/, 'vignette'],
  [/^hud/, 'hud'],
  [/^outlines/, 'page'],
  [/motion/, 'movement'],
  [/tones/, 'tones'],
];

export const sectionIcon = (title: string) => SECTIONS.find(([re]) => re.test(title))?.[1];

/** An icon, or an empty slot of the same size so titles stay aligned. */
export function icon(name: string | undefined) {
  const el = document.createElement('span');
  el.className = 'icon';
  const svg = name && ICONS[name];
  if (svg) el.innerHTML = `<svg viewBox="0 0 10 10" aria-hidden="true">${svg}</svg>`;
  return el;
}
