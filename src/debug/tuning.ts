import { SKYLINE, ATMOS, INK, AUDIO, CAPS, CCTV, DAYLIGHT, DRIPS, FANS, FLICKER, GRADE, VIGNETTE, HUD, LIGHTMAP, LIGHTS, PICKUP, SMOKE, THUNDER, PLAYER_LIGHT, VOLUMETRICS, WALL_HAND, MARKER, PAINT, PLAYER, PRESSURE, RENDER, SPRAY, VIEWMODEL, HOLD, ROLLER, SPONGE } from '../config';

// What the debug panel's contents are made of: collapsible sections of live
// sliders/toggles that write straight into the config objects, plus read-only
// stats. Each value knows its config path, so "copy" produces JSON that maps
// back onto config.ts. The sections themselves are in play-sections.ts and
// world-sections.ts.

type Obj = Record<string, unknown>;

export type Item =
  | { kind: 'range'; label: string; path: string[]; min: number; max: number; step: number; onChange?: () => void }
  | { kind: 'toggle'; label: string; path: string[]; onChange?: () => void }
  | { kind: 'color'; label: string; path: string[]; onChange?: () => void }
  | { kind: 'action'; label: string; run: () => void }
  | { kind: 'readout'; label: string; get: () => string }
  | { kind: 'heading'; label: string };

export interface Section {
  id: string;
  title: string;
  /** Group label shown above a run of sections (set by splitSections). */
  group?: string;
  open?: boolean;
  items: Item[];
}

const ROOTS: Record<string, Obj> = {
  PLAYER: PLAYER as unknown as Obj,
  RENDER: RENDER as unknown as Obj,
  CAPS: CAPS as unknown as Obj,
  PRESSURE: PRESSURE as unknown as Obj,
  PAINT: PAINT as unknown as Obj,
  SPRAY: SPRAY as unknown as Obj,
  MARKER: MARKER as unknown as Obj,
  ROLLER: ROLLER as unknown as Obj,
  SPONGE: SPONGE as unknown as Obj,
  VIEWMODEL: VIEWMODEL as unknown as Obj,
  HOLD: HOLD as unknown as Obj,
  ATMOS: ATMOS as unknown as Obj,
  INK: INK as unknown as Obj,
  LIGHTS: LIGHTS as unknown as Obj,
  LIGHTMAP: LIGHTMAP as unknown as Obj,
  VOLUMETRICS: VOLUMETRICS as unknown as Obj,
  GRADE: GRADE as unknown as Obj,
  VIGNETTE: VIGNETTE as unknown as Obj,
  HUD: HUD as unknown as Obj,
  DRIPS: DRIPS as unknown as Obj,
  PLAYER_LIGHT: PLAYER_LIGHT as unknown as Obj,
  WALL_HAND: WALL_HAND as unknown as Obj,
  DAYLIGHT: DAYLIGHT as unknown as Obj,
  PICKUP: PICKUP as unknown as Obj,
  AUDIO: AUDIO as unknown as Obj,
  THUNDER: THUNDER as unknown as Obj,
  CCTV: CCTV as unknown as Obj,
  SMOKE: SMOKE as unknown as Obj,
  FANS: FANS as unknown as Obj,
  FLICKER: FLICKER as unknown as Obj,
  SKYLINE: SKYLINE as unknown as Obj,
};

export function getValue(path: string[]): unknown {
  return parentOf(path)[path[path.length - 1]];
}

export function setValue(path: string[], v: unknown) {
  parentOf(path)[path[path.length - 1]] = v;
}

/**
 * The object holding a path's value. While build mode shows daylight, ATMOS
 * holds DAYLIGHT's values for some keys: those read and write the saved night
 * values instead, so the panel (and its copy) always shows the night look.
 */
function parentOf(path: string[]): Obj {
  const night = path[0] === 'ATMOS' ? live.atmosNight() : null;
  const root = night && path[1] in night ? night : ROOTS[path[0]];
  return path.slice(1, -1).reduce<unknown>((o, k) => (o as Obj)[k], root) as Obj;
}

/** Live values filled in by main (stats) and the player state. */
export const live = {
  stats: { fps: 0, frameMs: 0, lights: 0, drawCalls: 0, triangles: 0, textures: 0, textureBytes: 0, surfaces: 0, uploads: 0, uploadBytes: 0, particles: 0, drips: 0, bakedBytes: 0, bakePending: 0, bakeMs: 0 },
  player: null as null | { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; state: string },
  /** Main sets these so sliders can apply side effects. */
  applyPixelScale: () => {},
  rebuildLights: () => {},
  /** Rebuild the light props themselves (lens colors, floodlight heads), then their FX. */
  rebuildLightProps: () => {},
  /** Redraw the HUD vignette (VIGNETTE changed). */
  syncVignette: () => {},
  /** Push ATMOS colors / moon direction into fog, sky and lights. */
  syncAtmosphere: () => {},
  /** Re-apply DAYLIGHT if build mode is showing it. */
  applyDaylight: () => {},
  /** Rebuild the city around the level (SKYLINE changed). */
  rebuildCity: () => {},
  /** Give the player the starting nib and patch sizes (MARKER.radius, SPONGE.radius changed). */
  applyToolSizes: () => {},
  /** Rebuild the sponge's models (held, pickups, hotbar icon) from SPONGE.model / SPONGE.pickup. */
  rebuildSponge: () => {},
  /** Apply live SKYLINE values (line range). */
  syncSkyline: () => {},
  /** Debug: a lightning strike right now. */
  strikeLightning: () => {},
  /** GPU time of a render pass, as text ('n/a' without timer queries). */
  gpu: (_label: string) => 'n/a',
  /** While build mode shows daylight: the night values it replaced in ATMOS (see Atmosphere). */
  atmosNight: (): Obj | null => null,
};

export const r = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item => ({ kind: 'range', label, path, min, max, step, onChange });
export const t = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'toggle', label, path, onChange });
export const c = (label: string, path: string[], onChange?: () => void): Item => ({ kind: 'color', label, path, onChange });
/** Three sliders for a [x, y, z] array value. */
export const v3 = (label: string, path: string[], min: number, max: number, step: number, onChange?: () => void): Item[] =>
  ['x', 'y', 'z'].map((a, i) => r(`${label} ${a}`, [...path, String(i)], min, max, step, onChange));

/**
 * Every authored section becomes a group; its items are split at headings into
 * one collapsible section per heading (items before the first heading keep the
 * title "general"), so each part can be opened on its own.
 */
export function splitSections(list: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of list) {
    const split = s.items.some((it) => it.kind === 'heading');
    let cur: Section = { id: `${s.id}:general`, title: split ? 'general' : s.title, group: s.title, open: s.open, items: [] };
    const flush = () => {
      if (cur.items.length) out.push(cur);
    };
    for (const it of s.items) {
      if (it.kind === 'heading') {
        flush();
        const slug = it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        cur = { id: `${s.id}:${slug}`, title: it.label.toLowerCase(), group: s.title, items: [] };
      } else cur.items.push(it);
    }
    flush();
  }
  return out;
}

/** Values of the given sections as nested JSON mirroring config.ts. */
export function sectionsJSON(list: Section[]) {
  const out: Obj = {};
  for (const s of list) {
    for (const it of s.items) {
      if (it.kind !== 'range' && it.kind !== 'toggle' && it.kind !== 'color') continue;
      let o = out;
      // Numeric keys are array slots ([x, y, z] values copy back as arrays).
      it.path.slice(0, -1).forEach((k, i) => (o = (o[k] ??= /^\d+$/.test(it.path[i + 1]) ? [] : {}) as Obj));
      o[it.path[it.path.length - 1]] = getValue(it.path);
    }
  }
  return JSON.stringify(out, null, 2);
}
