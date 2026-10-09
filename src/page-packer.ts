// Blocks on shared square pages (textures many surfaces share, so many
// surfaces can be drawn in one call): shelf packing, a page at a time. Blocks
// start on multiples of `align` and are rounded up to it, so a texture's
// smaller levels never mix two blocks. A block given back is kept for the next
// one of the same size (a rebuilt prop asks for the same sizes again). Blocks
// of a `group` (a level tile) go on that group's pages first, so the surfaces
// drawn together share pages; a block bigger than a page gets a page of its own.

export interface PageSlot<P> {
  page: P;
  x: number;
  y: number;
  /** The block's size, rounded up to the alignment. */
  w: number;
  h: number;
}

interface Shelf {
  y: number;
  h: number;
  x: number;
}

export class PagePacker<P> {
  readonly pages: P[] = [];
  private shelves = new Map<P, { size: number; shelves: Shelf[]; top: number }>();
  private byGroup = new Map<string, P[]>();
  private spare = new Map<string, PageSlot<P>[]>();

  /** `make` creates page number `index`, `size` texels square. */
  constructor(
    private size: number,
    private align: number,
    private make: (index: number, size: number) => P,
  ) {}

  place(w: number, h: number, group: string): PageSlot<P> {
    w = this.up(w);
    h = this.up(h);
    const own = this.byGroup.get(group) ?? [];
    const kept = this.spare.get(`${w}x${h}`);
    const i = kept ? Math.max(0, kept.findIndex((s) => own.includes(s.page))) : -1;
    if (kept && i >= 0) {
      const [slot] = kept.splice(i, 1);
      if (!kept.length) this.spare.delete(`${w}x${h}`);
      return slot;
    }
    for (const page of own) {
      const slot = this.fit(page, w, h);
      if (slot) return slot;
    }
    const page = this.make(this.pages.length, Math.max(this.size, w, h));
    this.pages.push(page);
    this.shelves.set(page, { size: Math.max(this.size, w, h), shelves: [], top: 0 });
    this.byGroup.set(group, [...own, page]);
    return this.fit(page, w, h)!;
  }

  /** Give a block back: the next block of its size takes it. */
  release(slot: PageSlot<P>) {
    const k = `${slot.w}x${slot.h}`;
    (this.spare.get(k) ?? this.spare.set(k, []).get(k)!).push(slot);
  }

  /** Forget every block and page (a new level). */
  clear() {
    this.pages.length = 0;
    this.shelves.clear();
    this.byGroup.clear();
    this.spare.clear();
  }

  private fit(page: P, w: number, h: number): PageSlot<P> | null {
    const p = this.shelves.get(page)!;
    // The lowest shelf it fits on without wasting more than half the shelf's height.
    for (const s of p.shelves) {
      if (h <= s.h && h * 2 >= s.h && s.x + w <= p.size) {
        s.x += w;
        return { page, x: s.x - w, y: s.y, w, h };
      }
    }
    if (p.top + h > p.size || w > p.size) return null;
    p.shelves.push({ y: p.top, h, x: w });
    p.top += h;
    return { page, x: 0, y: p.top - h, w, h };
  }

  private up(n: number) {
    return Math.ceil(n / this.align) * this.align;
  }
}
