const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Backspace', 'Minus', 'Equal', 'KeyP', 'KeyO', 'KeyZ', 'KeyW', 'KeyS', 'KeyD', 'KeyA']);

import { enterGameFullscreen, exitGameFullscreen, isFullscreen } from './fullscreen';

// Keyboard + mouse state with pointer lock. Edge-triggered presses are consumed per frame.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private typed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelSteps = 0;
  lmb = false;
  /** LMB went down this frame. */
  lmbPressed = false;
  /** Mouse buttons (0 left, 1 middle, 2 right) pressed this frame. */
  private clicks = new Set<number>();
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code) && this.locked) e.preventDefault();
      if (this.locked && (e.ctrlKey || e.metaKey)) e.preventDefault();
      // With keyboard lock the browser no longer releases the mouse on Esc; do it ourselves.
      if (e.code === 'Escape' && this.locked) document.exitPointerLock();
      // Already paused: a second Esc leaves fullscreen, as it would without the keyboard lock.
      else if (e.code === 'Escape' && !e.repeat && isFullscreen()) void exitGameFullscreen();
      if (e.code === 'F3') e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        // Shortcut combos are recorded at keydown, so releasing Ctrl first can't drop them.
        if (e.ctrlKey || e.metaKey) this.pressed.add(`Ctrl+${e.code}`);
      }
      this.typed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.lmb = false;
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        this.requestLock();
        return;
      }
      e.preventDefault();
      this.clicks.add(e.button);
      if (e.button === 0) {
        this.lmb = true;
        this.lmbPressed = true;
      }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked) return;
        this.wheelSteps += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.lmb = false;
        this.down.clear();
      }
      this.onLockChange(this.locked);
    });
  }

  /**
   * Resume: pointer lock, fullscreen and keyboard lock. Call from a user gesture.
   * Chromium refuses pointer lock for about a second after Esc released it; the
   * pause menu simply stays up and the next click tries again.
   */
  requestLock() {
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // Refused (see above).
    }
    void enterGameFullscreen();
  }

  isDown(code: string) {
    return this.down.has(code);
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
    this.lmbPressed = false;
    this.clicks.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelSteps = 0;
  }
}
