// Keyboard + mouse state with pointer lock. Edge-triggered presses are consumed per frame.

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelSteps = 0;
  lmb = false;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.lmb = false;
    });
    element.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        element.requestPointerLock();
        return;
      }
      if (e.button === 0) this.lmb = true;
    });
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

  isDown(code: string) {
    return this.down.has(code);
  }

  wasPressed(code: string) {
    return this.pressed.has(code);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelSteps = 0;
  }
}
