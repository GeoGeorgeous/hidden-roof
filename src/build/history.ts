// Undo stack for the editor (Ctrl+Z). Entries record what was added/removed;
// undoing a removal re-adds it, under its old id when that's free (props),
// else a new one, and older entries are remapped.

export interface HistoryEntry {
  op: 'add' | 'remove';
  kind: 'prop' | 'pickup';
  id: number;
  data: unknown;
}

export class History {
  private stack: HistoryEntry[] = [];

  push(e: HistoryEntry) {
    this.stack.push(e);
    if (this.stack.length > 500) this.stack.shift();
  }

  clear() {
    this.stack.length = 0;
  }

  /**
   * Undo the last entry. `revert` performs the inverse operation and returns the
   * new id when it re-created something.
   */
  undo(revert: (e: HistoryEntry) => number | undefined) {
    const e = this.stack.pop();
    if (!e) return false;
    const newId = revert(e);
    if (newId !== undefined) for (const o of this.stack) if (o.kind === e.kind && o.id === e.id) o.id = newId;
    return true;
  }
}
