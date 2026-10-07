import { CATEGORIES, type Category, type PropDef } from '../kit/def';
import { defOf, kitIn } from '../kit';
import { PICKUP_GROUPS, type PickupKind } from '../inventory/items';

// What build mode places next: the mouse wheel turns the category wheel,
// E / Q step to the next / previous entry in it, Tab / Shift+Tab to its next /
// previous variant. Every category and entry remembers its selection.

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
}

function propEntry(base: PropDef): Entry {
  const defs = base.variants ? base.variants.map((v) => ({ label: v.label, def: defOf(base.type, v.id)! })) : [{ label: base.label, def: base }];
  const settings: Setting[] = [];
  const adjust = defs.find((d) => d.def.adjust)?.def.adjust;
  if (adjust) settings.push({ key: '[ ]', name: adjust.label });
  if (defs.some((d) => d.def.text !== undefined)) settings.push({ key: 'ENTER', name: 'TEXT' });
  return { label: base.label, variants: defs.map(({ label, def }) => ({ label, choice: { kind: 'prop', def } })), settings };
}

function entriesFor(c: Category): Entry[] {
  if (c === 'level') return [{ label: 'Spawn point', variants: [{ label: 'spawn point', choice: { kind: 'spawn' } }], settings: [] }];
  if (c === 'pickups') return PICKUP_GROUPS.map((g) => ({ label: g.label, variants: g.kinds.map((k) => ({ label: k.label, swatch: k.swatch, choice: { kind: 'pickup', type: k.kind } })), settings: [] }));
  return kitIn(c).map(propEntry);
}

export class Picker {
  readonly categories = CATEGORIES.map((id) => ({ id, entries: entriesFor(id) })).filter((c) => c.entries.length);
  private cat = 0;
  private index = this.categories.map(() => 0);
  private variants = new Map<Entry, number>();
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
