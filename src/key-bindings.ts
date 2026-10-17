import { BINDINGS, BROWSER_KEYS } from './config';
import { type Action, keyName } from './input';

// Rebinding play's actions (Settings → Controls) writes BINDINGS, as the other
// settings write config. Each action shows two slots; a modifier binds both its
// sides (CTRL is ControlLeft and ControlRight). A key another action has moves
// to this one and the actions swap; into an empty slot it leaves the other
// unbound. Saved as overrides: only actions bound unlike BINDINGS' defaults.

const DEFAULTS = structuredClone(BINDINGS) as Record<Action, string[]>;
const ACTIONS = Object.keys(BINDINGS) as Action[];
const SIDES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
/** Never bound: the menus' (Esc, Enter), the F3 panel's, Cmd and Win (the OS's), and the keys the browser keeps. */
const RESERVED = ['Escape', 'Enter', 'NumpadEnter', 'F3', 'Backquote', 'MetaLeft', 'MetaRight', ...BROWSER_KEYS.filter((k) => !k.includes('+'))];

/** The Controls tab's rows, in this order and with these names. */
export const ACTION_NAMES: Record<Action, string> = {
  forward: 'Forward',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  jump: 'Jump / climb',
  crouch: 'Crouch',
  sprint: 'Run',
  use: 'Spray / use',
  shake: 'Shake the can',
  next: 'Next color',
  prev: 'Previous color',
  sizeUp: 'Bigger cap / tool',
  sizeDown: 'Smaller cap / tool',
  slot1: 'Tool 1',
  slot2: 'Tool 2',
  slot3: 'Tool 3',
  slot4: 'Tool 4',
  slot5: 'Tool 5',
  screenshot: 'Screenshot',
  pick: 'Pick a color',
};

/** A slot is a code, or a modifier's name for both its sides. */
const codes = (slot: string) => (/^(Control|Shift|Alt|Meta)$/.test(slot) ? [`${slot}Left`, `${slot}Right`] : [slot]);

/** The action's slots: CTRL, C for crouch. */
export function slots(action: Action) {
  return [...new Set(BINDINGS[action].map((code) => code.replace(SIDES, '$1')))];
}

/** A slot as the game writes it. */
export const slotName = (slot: string) => keyName(codes(slot)[0]);

function set(action: Action, s: string[]) {
  BINDINGS[action] = s.flatMap(codes);
}

/** Binds `code` (a key, Mouse<n>, WheelUp or WheelDown) to the action's slot `i`; the error to show when it can't be. */
export function bind(action: Action, i: number, code: string): string | null {
  if (RESERVED.includes(code)) return `${keyName(code)} is taken`;
  const slot = code.replace(SIDES, '$1');
  const mine = slots(action);
  const old: string | undefined = mine[i];
  for (const other of ACTIONS) {
    const theirs = other === action ? mine : slots(other);
    const j = theirs.indexOf(slot);
    if (j < 0 || (other === action && j === i)) continue;
    if (old) theirs[j] = old;
    else theirs.splice(j, 1);
    if (other !== action) set(other, theirs);
  }
  mine[Math.min(i, mine.length)] = slot;
  set(action, mine.filter(Boolean));
  return null;
}

/** Every action back to BINDINGS' defaults. */
export function resetKeys() {
  for (const a of ACTIONS) BINDINGS[a] = [...DEFAULTS[a]];
}

/** The actions bound unlike their defaults, to save. */
export function keyOverrides() {
  return Object.fromEntries(ACTIONS.filter((a) => BINDINGS[a].join() !== DEFAULTS[a].join()).map((a) => [a, BINDINGS[a]]));
}

/** Applies saved bindings: known actions, no reserved keys. */
export function applyKeys(saved: Record<string, string[]> = {}) {
  for (const [a, list] of Object.entries(saved)) {
    if (a in BINDINGS && Array.isArray(list) && list.every((c) => typeof c === 'string' && !RESERVED.includes(c))) BINDINGS[a as Action] = list;
  }
}
