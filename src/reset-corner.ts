import { button, div, el } from './menu-ui';
import { msg } from './messages';

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
      this.el.replaceChildren(el('span', 'ask', msg('menu.resetAllAsk', { what: this.what })), button(msg('menu.reset'), () => answer(true), 'confirm'), button(msg('lobby.cancel'), () => answer(false), 'cancel'));
      return;
    }
    const all = button(msg('menu.resetAll'), () => {
      if (this.isDefault()) return;
      this.asking = true;
      this.sync();
    });
    all.classList.toggle('dim', this.isDefault());
    this.el.replaceChildren(all);
  }
}
