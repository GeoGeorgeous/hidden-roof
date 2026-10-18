import { BINDINGS, BROWSER_KEYS } from './config';
import { type Action, keyName } from './input';

// Rebinding play's actions (Settings → Controls) writes BINDINGS, as the other
// settings write config. Each action has two slots, a primary and an alternate,
// either empty; a modifier binds both its sides (Control is ControlLeft and
// ControlRight). A key is in one slot only: bound to another, it moves there
// and leaves its old slot empty. Saved as overrides: only actions bound unlike
// BINDINGS' defaults.

/** An action's two slots: a code, a modifier's name for both its sides, or null. */
export type Slots = (string | null)[];
export type Bound = Record<Action, Slots>;

const ACTIONS = Object.keys(BINDINGS) as Action[];
const SIDES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
const slotOf = (code: string) => code.replace(SIDES, '$1');
/** A slot's codes. */
const codes = (slot: string) => (/^(Control|Shift|Alt|Meta)$/.test(slot) ? [`${slot}Left`, `${slot}Right`] : [slot]);
const pair = (list: string[]): Slots => [...[...new Set(list.map(slotOf))], null, null].slice(0, 2);
const copy = (b: Bound) => Object.fromEntries(ACTIONS.map((a) => [a, [...b[a]]])) as Bound;

const DEFAULTS = Object.fromEntries(ACTIONS.map((a) => [a, pair(BINDINGS[a])])) as Bound;
let bound = copy(DEFAULTS);

/** The Controls tab's groups and rows, in this order, with their names and descriptions. */
export const CONTROL_GROUPS: { name: string; rows: { action: Action; name: string; desc?: string }[] }[] = [
  {
    name: 'move',
    rows: [
      { action: 'forward', name: 'Forward' },
      { action: 'back', name: 'Back' },
      { action: 'left', name: 'Left' },
      { action: 'right', name: 'Right' },
      { action: 'jump', name: 'Jump / climb', desc: 'Also climbs a ladder.' },
      { action: 'crouch', name: 'Crouch', desc: 'Also holds you on a ladder.' },
      { action: 'sprint', name: 'Run' },
    ],
  },
  {
    name: 'paint',
    rows: [
      { action: 'use', name: 'Spray / use', desc: 'Spray, draw, roll or scrub. Also places the stepladder.' },
      { action: 'shake', name: 'Shake the can' },
      { action: 'next', name: 'Next color', desc: 'Also turns the stepladder.' },
      { action: 'prev', name: 'Previous color', desc: 'Also turns the stepladder.' },
      { action: 'sizeUp', name: 'Bigger cap / tool', desc: 'Next cap or a wider tool. Holding it repeats.' },
      { action: 'sizeDown', name: 'Smaller cap / tool', desc: 'Previous cap or a narrower tool. Holding it repeats.' },
      { action: 'pick', name: 'Pick a color', desc: 'Switch to the color you carry that is closest to the paint under the crosshair.' },
    ],
  },
  { name: 'tools', rows: ([1, 2, 3, 4, 5] as const).map((n) => ({ action: `slot${n}` as const, name: `Tool ${n}` })) },
  { name: 'other', rows: [{ action: 'screenshot', name: 'Screenshot' }] },
];

function apply() {
  for (const a of ACTIONS) BINDINGS[a] = bound[a].filter((s) => s !== null).flatMap(codes);
}

/** An action's name on the Controls tab. */
export const nameOf = (action: Action) => CONTROL_GROUPS.flatMap((g) => g.rows).find((r) => r.action === action)!.name;

/** Actions played by holding (Input.held): a wheel step can't be held, so it isn't bound to them. */
const HELD: readonly Action[] = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'sprint', 'use', 'shake'];

/** Why `code` can't be bound to `action`: the menus' (Enter), the F3 panel's, the system's (Cmd, Win), the browser's, or a wheel step for a held action; null when it can. Esc cancels. */
export function refusal(code: string, action: Action) {
  if (code.startsWith('Wheel') && HELD.includes(action)) return `${nameOf(action)} is held down, and a wheel step can't be.`;
  if (code === 'Enter' || code === 'NumpadEnter') return 'Enter is for the menus.';
  if (code === 'F3' || code === 'Backquote') return `${keyName(code)} opens the debug panel.`;
  if (code === 'MetaLeft' || code === 'MetaRight') return keyName(code) === 'Win' ? 'The Windows key belongs to the system.' : `${keyName(code)} belongs to the system.`;
  if (BROWSER_KEYS.includes(code) && code !== 'Escape') return `${code} belongs to the browser.`;
  return null;
}

/** The action's two slots. */
export const slots = (action: Action): readonly (string | null)[] => bound[action];

/** The action's default for slot `i`. */
export const defaultSlot = (action: Action, i: number) => DEFAULTS[action][i];

/** Binds `code` (a key, Mouse<n>, WheelUp or WheelDown; null clears) to the action's slot `i`; the action it moved from, if another had it. */
export function bind(action: Action, i: number, code: string | null): Action | null {
  const slot = code && slotOf(code);
  let from: Action | null = null;
  for (const a of ACTIONS) {
    bound[a].forEach((s, j) => {
      if (!slot || s !== slot || (a === action && j === i)) return;
      bound[a][j] = null;
      if (a !== action) from = a;
    });
  }
  bound[action][i] = slot;
  apply();
  return from;
}

/** Every slot as it is, for an undo. */
export const snapshot = () => copy(bound);

export function restore(b: Bound) {
  bound = copy(b);
  apply();
}

/** Every action back to BINDINGS' defaults. */
export const resetKeys = () => restore(DEFAULTS);

const same = (a: Slots, b: Slots) => a[0] === b[0] && a[1] === b[1];

export const allDefault = () => ACTIONS.every((a) => same(bound[a], DEFAULTS[a]));

/** The actions bound unlike their defaults, to save. */
export function keyOverrides() {
  return Object.fromEntries(ACTIONS.filter((a) => !same(bound[a], DEFAULTS[a])).map((a) => [a, bound[a]]));
}

/** Applies saved bindings: known actions, two slots each, no reserved keys. */
export function applyKeys(saved: Record<string, Slots> = {}) {
  for (const [a, s] of Object.entries(saved)) {
    if (a in bound && Array.isArray(s) && s.length === 2 && s.every((c) => c === null || (typeof c === 'string' && !refusal(c, a as Action)))) bound[a as Action] = [...s];
  }
  apply();
}
