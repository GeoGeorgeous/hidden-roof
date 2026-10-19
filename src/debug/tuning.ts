import * as config from '../config';
import { defaultOf } from './defaults';

// What the debug panel's contents are made of: collapsible sections of live
// sliders/toggles that write straight into the config objects, plus read-only
// stats. Each value knows its config path, so "copy" produces JSON that maps
// back onto config.ts and "reset" puts config.ts's value back. The sections
// themselves are in play-sections.ts and world-sections.ts.

type Obj = Record<string, unknown>;

/**
 * When a value row's change shows, if not at once while dragging (rows.ts tags
 * the row): `release` when the slider is let go, `bake` once the lamp light
 * rebakes (a moment), `build` only in build mode.
 */
export type When = 'release' | 'bake' | 'build';

export type Item =
  /** `onRelease`: runs when the slider is let go (and on reset), for work too slow for every tick. */
  | { kind: 'range'; label: string; path: string[]; min: number; max: number; step: number; onChange?: () => void; onRelease?: () => void; when?: When }
  | { kind: 'toggle'; label: string; path: string[]; onChange?: () => void; when?: When }
  | { kind: 'color'; label: string; path: string[]; onChange?: () => void; when?: When }
  /** A hex color edited as one shade of gray. */
  | { kind: 'gray'; label: string; path: string[]; onChange?: () => void; when?: When }
  | { kind: 'action'; label: string; run: () => void }
  | { kind: 'readout'; label: string; get: () => string }
  /** One of a few buttons, the picked one lit (`get`); picking can change any value, so the panel re-reads them all. */
  /** `copy`: values COPY adds, by config export name (the presets behind it); `reset`: RESET puts those back too. */
  | { kind: 'choice'; label: string; options: string[]; get: () => number; pick: (i: number) => void; copy?: () => Obj; reset?: () => void }
  /** Starts a section; `disabled` shows it grayed out, untouchable. */
  | { kind: 'heading'; label: string; disabled?: boolean };

/** An item that edits a config value. */
type Value = Extract<Item, { path: string[] }>;

export const isValue = (it: Item): it is Value => 'path' in it;

/** The value differs from config.ts (colors in any case). */
export function isChanged(it: Value, night?: Night) {
  const v = getValue(it.path, night);
  const d = defaultOf(it.path);
  if (d === undefined) return false;
  return typeof v === 'string' && typeof d === 'string' ? v.toLowerCase() !== d.toLowerCase() : v !== d;
}

/** Puts config.ts's values back (nothing is saved), then runs each side effect once. */
export function resetItems(items: Item[], night?: Night) {
  const effects = new Set<() => void>();
  for (const it of items) {
    if (it.kind === 'choice') it.reset?.();
    if (!isValue(it) || !isChanged(it, night)) continue;
    setValue(it.path, defaultOf(it.path), night);
    if (it.onChange) effects.add(it.onChange);
    if (it.kind === 'range' && it.onRelease) effects.add(it.onRelease);
  }
  for (const f of effects) f();
}

export interface Section {
  id: string;
  title: string;
  /** Group label shown above a run of sections (set by splitSections). */
  group?: string;
  open?: boolean;
  disabled?: boolean;
  items: Item[];
}

/** While build mode shows daylight: the night values it replaced in ATMOS (see Atmosphere), else null. */
export type Night = () => Obj | null;

/** Config objects by export name: a path's first key. */
const ROOTS = config as unknown as Record<string, Obj>;

export function getValue(path: string[], night?: Night): unknown {
  return parentOf(path, night)[path[path.length - 1]];
}

export function setValue(path: string[], v: unknown, night?: Night) {
  parentOf(path, night)[path[path.length - 1]] = v;
}

/**
 * The object holding a path's value. While build mode shows daylight, ATMOS
 * holds DAYLIGHT's values for some keys: those read and write the saved night
 * values instead, so the panel (and its copy) always shows the night look.
 */
function parentOf(path: string[], night?: Night): Obj {
  const saved = path[0] === 'ATMOS' ? night?.() : null;
  const root = saved && path[1] in saved ? saved : ROOTS[path[0]];
  return path.slice(1, -1).reduce<unknown>((o, k) => (o as Obj)[k], root) as Obj;
}

/** The rows' side effects, built by the dev tools before the panel (`new DebugPanel(hooks, atmosNight)`). */
export interface Hooks {
  rebuildLights(): void;
  /** Rebuild the light props themselves (lens colors, floodlight heads), then their FX. */
  rebuildLightProps(): void;
  /** Redraw the HUD vignette (VIGNETTE changed). */
  syncVignette(): void;
  /** Show the full pause sheet behind the panel for a moment (F3 → UI → Pause menu). */
  previewPause(): void;
  /** Push ATMOS colors / moon direction into fog, sky and lights. */
  syncAtmosphere(): void;
  /** Re-apply DAYLIGHT if build mode is showing it. */
  applyDaylight(): void;
  /** Restyle build mode: the picker's size and shade, the target outline, the settings highlight (BUILD.wheelScale, columnScale, shade*, target*, highlight*). */
  syncBuildLook(): void;
  /** Rebuild the city around the level (SKYLINE changed). */
  rebuildCity(): void;
  /** Give the player the starting nib and patch sizes (MARKER, ROLLER or SPONGE.width changed). */
  applyToolSizes(): void;
  /** F3 -> Items: every tool, color and cap, their pickups gone as if collected. */
  unlockAll(): void;
  /** Rebuild every tool model (first person, pickups, hotbar icons, the figure's tool) from MODELS and CAPS. */
  rebuildModels(): void;
  /** Apply live SKYLINE values (line range). */
  syncSkyline(): void;
  /** F3 -> Avatar: the test figure (dev/avatar-preview.ts). */
  avatarToggle(): void;
  avatarNext(): void;
  avatarPrevious(): void;
  /** AVATAR_TEST.pose was set: show that one. */
  avatarPick(): void;
  avatarCycle(): void;
  avatarRestyle(): void;
  avatarPose(): string;
  /** F3 -> Ghost (dev/ghost.ts). */
  ghostRecord(): void;
  ghostPlay(): void;
  ghostFollow(): void;
  ghostStop(): void;
  ghostState(): string;
  /** The ghost's network as its remote player sees it, or null. */
  ghostNet(): null | { delay: number; jitter: number; buffered: number; guessing: boolean; correction: number };
  /** F3 -> Test -> Performance: profiling mode (dev/profiler.ts). */
  profileToggle(): void;
  profileProbe(): void;
  profileState(): string;
  /** Debug: a lightning strike right now. */
  strikeLightning(): void;
  /** GPU time of a render pass, as text ('n/a' without timer queries). */
  gpu(label: string): string;
}

/** Live values filled in by the dev tools each frame: the stats and the player's state. */
export const live = {
  stats: { fps: 0, frameMs: 0, lights: 0, drawCalls: 0, triangles: 0, textures: 0, textureBytes: 0, surfaces: 0, uploads: 0, uploadBytes: 0, particles: 0, drips: 0, bakedBytes: 0, bakePending: 0, bakeMs: 0, paintOps: 0 },
  player: null as null | { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; state: string },
};

export const r = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item => ({ kind: 'range', label, path, min, max, step, onChange });
export const t = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'toggle', label, path, onChange });
export const c = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'color', label, path, onChange });
export const gray = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'gray', label, path, onChange });
/** These items, tagged with when their change shows (When). */
export const when = (w: When, items: Item[]): Item[] => items.map((it) => ('path' in it ? { ...it, when: w } : it));
/** Three sliders for a [x, y, z] array value. */
export const v3 = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item[] =>
  ['x', 'y', 'z'].map((a, i) => r(`${label} ${a}`, [...path, String(i)], min, max, step, onChange));

/**
 * Every authored section becomes a group; its items are split at headings into
 * one collapsible section per heading (items before the first heading, or all
 * of them, are titled "general"), so each part can be opened on its own.
 */
export function splitSections(list: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of list) {
    let cur: Section = { id: `${s.id}:general`, title: 'general', group: s.title, open: s.open, items: [] };
    const flush = () => {
      if (cur.items.length) out.push(cur);
    };
    for (const it of s.items) {
      if (it.kind === 'heading') {
        flush();
        const slug = it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        cur = { id: `${s.id}:${slug}`, title: it.label.toLowerCase(), group: s.title, disabled: it.disabled, items: [] };
      } else cur.items.push(it);
    }
    flush();
  }
  return out;
}

/** Copies `from` into `to`, object by object, so values of one config object from several rows add up. */
function merge(to: Obj, from: Obj) {
  for (const [k, v] of Object.entries(from)) {
    const o = to[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && o && typeof o === 'object') merge(o as Obj, v as Obj);
    else to[k] = v;
  }
}

/** Values of the given sections as nested JSON mirroring config.ts. */
export function sectionsJSON(list: Section[], night?: Night) {
  const out: Obj = {};
  for (const s of list) {
    for (const it of s.items) {
      if (it.kind === 'choice' && it.copy) merge(out, it.copy());
      if (!isValue(it)) continue;
      let o = out;
      // Numeric keys are array slots ([x, y, z] values copy back as arrays).
      it.path.slice(0, -1).forEach((k, i) => (o = (o[k] ??= /^\d+$/.test(it.path[i + 1]) ? [] : {}) as Obj));
      o[it.path[it.path.length - 1]] = getValue(it.path, night);
    }
  }
  return JSON.stringify(out, null, 2);
}
