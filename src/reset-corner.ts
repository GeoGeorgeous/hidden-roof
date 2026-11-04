import { button, div, el } from './menu-ui';

// Reset all, top right of a Settings tab: dimmed when all is at its default,
// asks before it resets.

export class ResetCorner {
  readonly el = div('seg reset-all');
  private asking = false;

  /** `what`: the tab's settings, for the question. `reset`: resets them; the owner syncs the page. */
  constructor(
    private what: string,
    private isDefault: () => boolean,
    private reset: () => void,
  ) {}

  /** The question goes when the tab is left. */
  close() {
    this.asking = false;
  }

  sync() {
    if (this.asking) {
      const answer = (reset: boolean) => {
        this.asking = false;
        if (reset) this.reset();
        this.sync();
      };
      this.el.replaceChildren(el('span', 'ask', `Reset all ${this.what}?`), button('Reset', () => answer(true), 'confirm'), button('Cancel', () => answer(false), 'cancel'));
      return;
    }
    const all = button('Reset all', () => {
      if (this.isDefault()) return;
      this.asking = true;
      this.sync();
    });
    all.classList.toggle('dim', this.isDefault());
    this.el.replaceChildren(all);
  }
}
