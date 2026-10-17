// The player's settings in this browser (localStorage), read once at start and
// written on every change. Most are kept as overrides: a value equal to
// config's default isn't saved, so a changed default reaches everyone who never
// touched it. Unavailable storage (private mode) keeps them for the session.

const KEY = 'roofhiddenhaus.settings';
/** Settings saved under the old name (taggin): read once, so nothing resets with the rename. */
const RENAMED_KEY = 'taggin.settings.v2';
/** Settings saved before v2: their paint detail and volumetrics are dropped, so the defaults (ULTRA, off) apply once. */
const OLD_KEY = 'taggin.settings';

export interface Saved {
  /** INK_STYLES name. */
  style?: string;
  pixelScale?: number;
  maxFps?: number;
  volumetrics?: string;
  paintDetail?: string;
  cityDetail?: string;
  /** Config fields changed from their defaults (REMEMBERED in settings.ts), as `OBJECT.field`. */
  values?: Record<string, number | boolean>;
  /** Actions bound to other keys than BINDINGS' defaults (key-bindings.ts): two slots each. Saves before them (`keys`) are dropped, so everyone starts from the defaults. */
  controls?: Record<string, (string | null)[]>;
}

export function loadSaved(): Saved {
  try {
    const saved = localStorage.getItem(KEY) ?? localStorage.getItem(RENAMED_KEY);
    if (saved) return JSON.parse(saved) as Saved;
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Saved;
    return { pixelScale: old.pixelScale, cityDetail: old.cityDetail };
  } catch {
    return {};
  }
}

/** Merges `part` into what's saved. */
export function save(part: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSaved(), ...part }));
  } catch {
    // Storage unavailable (private mode): settings last for this session only.
  }
}

/** A config field kept as an override: `name` is how it's saved. */
export interface Remembered {
  name: string;
  obj: Record<string, unknown>;
  field: string;
}

/** The fields' config defaults, read before any saved value is applied. */
export function defaultsOf(fields: Remembered[]) {
  return new Map(fields.map((f) => [f.name, f.obj[f.field]]));
}

/** Sets each saved field whose type matches its default's. */
export function applyValues(fields: Remembered[], defaults: Map<string, unknown>, values: Saved['values'] = {}) {
  for (const f of fields) if (f.name in values && typeof values[f.name] === typeof defaults.get(f.name)) f.obj[f.field] = values[f.name];
}

/** The fields that differ from their defaults. */
export function changedValues(fields: Remembered[], defaults: Map<string, unknown>) {
  return Object.fromEntries(fields.filter((f) => f.obj[f.field] !== defaults.get(f.name)).map((f) => [f.name, f.obj[f.field] as number | boolean]));
}
