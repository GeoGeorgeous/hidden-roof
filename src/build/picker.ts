import { CATEGORIES, type Category, type PropDef } from '../kit/def';
import { defOf, kitIn } from '../kit';
import { PICKUP_GROUPS, type PickupKind } from '../inventory/items';
import { FINISHES, type Finish, type FinishKind } from '../kit/finishes';

// What build mode places next: the mouse wheel turns the category wheel,
// E / Q step to the next / previous entry in it, Tab / Shift+Tab to its next /
// previous variant, F through the wall finishes of the pieces that take them,
// R flips wall pieces. Every category and entry remembers its selection.

/** What a click places: a prop (resolved to its variant), a pickup kind, or the level's one spawn point (moved there). */
export type Choice = { kind: 'prop'; def: PropDef } | { kind: 'pickup'; type: PickupKind } | { kind: 'spawn' };

interface Variant {
  label: string;
  choice: Choice;
  /** A paint pickup's color, shown on its chip. */
  swatch?: string;
}

/** A per-instance setting of a prop: the key that changes a placed one, and what it changes. */
interface Setting {
  key: string;
  name: string;
}

export interface Entry {
  label: string;
  /** One or more. */
  variants: Variant[];
  settings: Setting[];
  /** Finishes its pieces take (PropDef.finishes). */
  finishes: FinishKind[];
}

function propEntry(base: PropDef): Entry {
  const defs = base.variants ? base.variants.map((v) => ({ label: v.label, def: defOf(base.type, v.id)! })) : [{ label: base.label, def: base }];
  const settings: Setting[] = [];
  const adjust = defs.find((d) => d.def.adjust)?.def.adjust;
  if (adjust) settings.push({ key: '[ ]', name: adjust.label });
  if (defs.some((d) => d.def.text !== undefined)) settings.push({ key: 'ENTER', name: 'TEXT' });
  return { label: base.label, variants: defs.map(({ label, def }) => ({ label, choice: { kind: 'prop', def } })), settings, finishes: base.finishes ?? [] };
}

function entriesFor(c: Category): Entry[] {
  if (c === 'level') return [{ label: 'Spawn point', variants: [{ label: 'spawn point', choice: { kind: 'spawn' } }], settings: [], finishes: [] }];
  if (c === 'pickups') return PICKUP_GROUPS.map((g) => ({ label: g.label, variants: g.kinds.map((k) => ({ label: k.label, swatch: k.swatch, choice: { kind: 'pickup', type: k.kind } })), settings: [], finishes: [] }));
  return kitIn(c).map(propEntry);
}

export class Picker {
  readonly categories = CATEGORIES.map((id) => ({ id, entries: entriesFor(id) })).filter((c) => c.entries.length);
  private cat = 0;
  private index = this.categories.map(() => 0);
  private variants = new Map<Entry, number>();
  /** The finishes the next pieces get (none: their own look). */
  finish: Finish = {};
  /** Wall pieces face out of the wall they go on, so R flips the next ones left to right instead (PropData.mirror). */
  flip = false;
  /** Bumped on every change, so the view redraws only then. */
  version = 0;

  get category() {
    return this.cat;
  }

  /** The selected entry of the selected category. */
  get selected() {
    return this.index[this.cat];
  }

  get entry(): Entry {
    return this.categories[this.cat].entries[this.index[this.cat]];
  }

  variantOf(e: Entry) {
    return this.variants.get(e) ?? 0;
  }

  get choice(): Choice {
    return this.entry.variants[this.variantOf(this.entry)].choice;
  }

  /** The selection's name: the entry's, and its variant's when it has several. */
  get label() {
    const e = this.entry;
    return e.variants.length > 1 ? `${e.label} (${e.variants[this.variantOf(e)].label})` : e.label;
  }

  /** Mouse wheel: the next / previous category, round the wheel. */
  wheel(dir: number) {
    this.cat = wrap(this.cat + dir, this.categories.length);
    this.version++;
  }

  /** E / Q: the next / previous entry in the category. */
  step(dir: number) {
    this.index[this.cat] = wrap(this.index[this.cat] + dir, this.categories[this.cat].entries.length);
    this.version++;
  }

  /** Tab / Shift+Tab: the next / previous variant of the entry. */
  variant(dir: number) {
    const e = this.entry;
    this.variants.set(e, wrap(this.variantOf(e) + dir, e.variants.length));
    this.version++;
  }

  /** F: the next / previous wall finish, round to none (each piece's own look). */
  cycleFinish(kind: FinishKind, dir: number) {
    const ids = [undefined, ...Object.keys(FINISHES[kind])];
    this.finish = { ...this.finish, [kind]: ids[wrap(ids.indexOf(this.finish[kind]) + dir, ids.length)] };
    this.version++;
  }

  /** The current finishes, of the kinds `def` takes; undefined when it takes none of them. */
  finishFor(def: PropDef): Finish | undefined {
    const f = Object.fromEntries((def.finishes ?? []).filter((k) => this.finish[k]).map((k) => [k, this.finish[k]]));
    return Object.keys(f).length ? f : undefined;
  }

  setFlip(on: boolean) {
    this.flip = on;
    this.version++;
  }

  /** Take a placed piece's finishes as the current ones (middle-click pick). */
  pickFinish(f: Finish | undefined) {
    this.finish = { ...f };
    this.version++;
  }

  /** Select the entry and variant whose choice matches (middle-click pick). */
  pick(match: (c: Choice) => boolean) {
    this.categories.forEach((c, ci) =>
      c.entries.forEach((e, ei) =>
        e.variants.forEach((v, vi) => {
          if (!match(v.choice)) return;
          this.cat = ci;
          this.index[ci] = ei;
          this.variants.set(e, vi);
          this.version++;
        }),
      ),
    );
  }
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;
