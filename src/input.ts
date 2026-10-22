import { layoutName } from './key-name';
import { BINDINGS, RENDER, WHEEL } from './config';
import { enterGameFullscreen } from './fullscreen';
import { currentOs } from './gpu-name';

// Keyboard + mouse state with pointer lock. Edge-triggered presses are consumed per frame.
// Play asks by action (BINDINGS); build mode and the dev keys ask by raw code.
// The browser defaults it cancels are in BROWSER_GUARDS (browser-guards.ts).

export type Action = keyof typeof BINDINGS;

/** A Mac (its key names), else Windows and Linux. */
const MAC = currentOs() === 'mac';
/** A modifier's left or right side. */
const SIDES = /^(Control|Shift|Alt|Meta)(Left|Right)$/;
/** A modifier's code as its name for both sides (ShiftLeft is Shift); any other code as it is. */
export const sideless = (code: string) => code.replace(SIDES, '$1');

/** Keys named per platform: a modifier's name stands for both its sides. */
const PLATFORM_NAMES: Record<string, string> = MAC
  ? { Control: '⌃ Control', Shift: '⇧ Shift', Alt: '⌥ Option', Tab: '⇥ Tab', CapsLock: '⇪ Caps Lock', Backspace: '⌫ Delete', Delete: '⌦ Fwd Delete', Meta: '⌘ Command' }
  : { Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Tab: 'Tab', CapsLock: 'Caps Lock', Backspace: 'Backspace', Delete: 'Delete', Meta: 'Win' };

/** Bindings whose name isn't the key's code without Key or Digit, or the layout's key. */
const NAMES: Record<string, string> = {
  Space: 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  Mouse3: 'Mouse 4',
  Mouse4: 'Mouse 5',
  WheelUp: 'Wheel ↑',
  WheelDown: 'Wheel ↓',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  IntlBackslash: '§',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  ContextMenu: 'Menu',
};
const NUMPAD: Record<string, string> = { Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: '.' };

/** What each key prints on this keyboard's layout (Chromium): W is Z on AZERTY. Elsewhere, and for a non-Latin layout, the US name. */
let layout: Map<string, string> | undefined;
(navigator as Navigator & { keyboard?: { getLayoutMap?(): Promise<Map<string, string>> } }).keyboard
  ?.getLayoutMap?.()
  .then((m) => (layout = m))
  .catch(() => {});

/** A binding as the game writes it, on this platform: LMB, Shift (⇧ Shift on a Mac), W, ↑, Num 1. */
export function keyName(code: string) {
  const key = sideless(code);
  if (key.startsWith('Numpad')) return `Num ${NUMPAD[key.slice(6)] ?? key.slice(6)}`;
  return PLATFORM_NAMES[key] ?? layoutName(layout?.get(key)) ?? NAMES[key] ?? key.replace(/^(Key|Digit)/, '');
}

/** The action's first binding, in the HUD's capitals: HOLD [RMB] TO SHAKE. */
export function label(action: Action) {
  return BINDINGS[action].length ? keyName(BINDINGS[action][0]).toUpperCase() : '—';
}

/** A text field, number field, select or editable element: keys typed there belong to it. */
function typingIn(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private typed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelSteps = 0;
  /** Scroll (px) toward the next wheel step. */
  private wheelPx = 0;
  lmb = false;
  rmb = false;
  /** Mouse buttons (0 left, 1 middle, 2 right) pressed this frame. */
  private clicks = new Set<number>();
  private isLocked = false;
  onLockChange: (locked: boolean) => void = () => {};
  /** A click on the game while paused: resume (main.ts routes it through the play state). */
  onResume: () => void = () => this.requestLock();
  /** A key went down or up: true when it's the menu's (Esc; Enter on the pause menu, play-state.ts), so it isn't a game key. */
  onMenuKey: (code: string, down: boolean, repeat: boolean) => boolean = () => false;

  /** Without an element nothing ever reaches it: the player's input while paused in a session. */
  constructor(private element?: HTMLElement) {
    if (!element) return;
    window.addEventListener('keydown', (e) => this.key(e.code, true, e.repeat, { ctrl: e.ctrlKey, meta: e.metaKey, target: e.target }));
    window.addEventListener('keyup', (e) => this.key(e.code, false));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.lmb = this.rmb = false;
      this.wheelPx = 0;
    });
    element.addEventListener('mousedown', (e) => this.button(e.button, true));
    window.addEventListener('mouseup', (e) => this.button(e.button, false));
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        // Pixels, lines or pages; turning back starts over, so the first notch back steps.
        const px = e.deltaY * (e.deltaMode === 1 ? WHEEL.linePx : e.deltaMode === 2 ? WHEEL.notchPx : 1);
        // A sideways event (a swipe's other component) keeps the part of a step so far.
        if (!px) return;
        if (Math.sign(px) !== Math.sign(this.wheelPx)) this.wheelPx = 0;
        this.wheelPx += px;
        const steps = Math.trunc(this.wheelPx / WHEEL.notchPx);
        this.wheelPx -= steps * WHEEL.notchPx;
        this.wheel(steps);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => this.setLocked(document.pointerLockElement === this.element));
  }

  /**
   * A key went down or up, as the browser reports it (the listeners' one entry, and the way tests press keys).
   * `target`: where a keydown came from, `ctrl`/`meta`: modifiers held with it.
   */
  key(code: string, down: boolean, repeat = false, mods: { ctrl?: boolean; meta?: boolean; target?: EventTarget | null } = {}) {
    if (!down) {
      this.down.delete(code);
      // macOS sends no keyup for keys released while Cmd is held: drop them all (one still held comes back on its auto-repeat).
      if (sideless(code) === 'Meta') this.down.clear();
      this.onMenuKey(code, false, false);
      return;
    }
    // Typing into a field (the session code, a name, a number in F3) is not playing: a K must not take a screenshot.
    // Esc and F3 still work there, and Enter still runs the page's primary button.
    const typing = typingIn(mods.target ?? null);
    if (typing && !['Escape', 'F3', 'Enter', 'NumpadEnter'].includes(code)) return;
    if (this.onMenuKey(code, true, repeat) || (typing && code !== 'F3')) return;
    if (!repeat) {
      this.pressed.add(code);
      // Shortcut combos are recorded at keydown, so releasing Ctrl first can't drop them.
      if (mods.ctrl || mods.meta) this.pressed.add(`Ctrl+${code}`);
    }
    this.typed.add(code);
    this.down.add(code);
  }

  /** A mouse button (0 left, 1 middle, 2 right) went down or up. While paused a press resumes instead. */
  button(n: number, down: boolean) {
    if (down && !this.locked) {
      this.onResume();
      return;
    }
    if (down) (this.clicks.add(n), this.down.add(`Mouse${n}`));
    else this.down.delete(`Mouse${n}`);
    if (n === 0) this.lmb = down;
    if (n === 2) this.rmb = down;
  }

  /** Whole wheel steps taken (positive down), as the listener counts them from the scroll. */
  wheel(steps: number) {
    this.wheelSteps += steps;
  }

  /** The pointer is locked to the game: playing. */
  get locked() {
    return this.isLocked;
  }

  /** The pointer lock came or went: the browser's (pointerlockchange), or a test's (the one way tests start and stop play). */
  setLocked(locked: boolean) {
    this.isLocked = locked;
    // Keys pressed while paused belong to the menu: the Enter that resumed must not reach build mode in the first frame back.
    if (locked) {
      this.pressed.clear();
      this.typed.clear();
    } else {
      this.lmb = this.rmb = false;
      this.down.clear();
    }
    this.onLockChange(locked);
  }

  /**
   * Resume: pointer lock, fullscreen and keyboard lock. Call from a user gesture.
   * Chromium refuses pointer lock for about a second after Esc released it; the
   * pause menu simply stays up and the next click tries again.
   */
  requestLock() {
    try {
      const p = this.element?.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Refused (see above).
    }
    if (RENDER.fullscreen) void enterGameFullscreen();
  }

  /** Any of the action's bindings held (the left and right buttons as tests set them). */
  held(action: Action) {
    return BINDINGS[action].some((code) => (code === 'Mouse0' ? this.lmb : code === 'Mouse2' ? this.rmb : this.down.has(code)));
  }

  /** Any of the action's bindings pressed this frame. */
  justPressed(action: Action) {
    return BINDINGS[action].some((code) => this.hit(code, this.pressed));
  }

  /** Pressed this frame, including keyboard auto-repeat. */
  repeated(action: Action) {
    return BINDINGS[action].some((code) => this.hit(code, this.typed));
  }

  /** 1 for `more` (repeated), -1 for `less`, 0 for neither or both. */
  step(less: Action, more: Action) {
    return (this.repeated(more) ? 1 : 0) - (this.repeated(less) ? 1 : 0);
  }

  /** A mouse button clicked or a wheel step taken this frame; else the key in `keys`. */
  private hit(code: string, keys: Set<string>) {
    if (code.startsWith('Mouse')) return this.clicks.has(Number(code.slice(5)));
    if (code === 'WheelDown') return this.wheelSteps > 0;
    if (code === 'WheelUp') return this.wheelSteps < 0;
    return keys.has(code);
  }

  isDown(code: string) {
    return this.down.has(code);
  }

  /** Either Shift key held. */
  shiftDown() {
    return this.down.has('ShiftLeft') || this.down.has('ShiftRight');
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  clicked(button: number) {
    return this.clicks.has(button);
  }

  /** Pressed this frame, including keyboard auto-repeat. */
  wasTyped(code: string) {
    return this.typed.has(code);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.typed.clear();
    this.clicks.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelSteps = 0;
  }
}
