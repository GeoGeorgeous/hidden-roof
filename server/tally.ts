// Counting into plain objects keyed by names a stranger may choose ("constructor" among them).

/** `n` more under `key` in `to`. */
export function bump<K extends string>(to: Partial<Record<K, number>>, key: K, n = 1) {
  to[key] = (Object.hasOwn(to, key) ? to[key]! : 0) + n;
}

/** `from`'s counts added to `to`'s. */
export function addMaps<K extends string>(to: Partial<Record<K, number>>, from: Partial<Record<K, number>>) {
  for (const key of Object.keys(from) as K[]) bump(to, key, from[key]!);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && !!x && !Array.isArray(x);

/** `from` (read from a file) with what `base` has and it lacks, at any depth, and what has another type than in `base`, taken from `base`. `base` is a fresh value nobody else holds. */
export function filled<T extends object>(base: T, from: unknown): T {
  if (!isObj(from)) return base;
  const out: Record<string, unknown> = { ...from };
  for (const [k, v] of Object.entries(base)) {
    if (!Object.hasOwn(from, k)) out[k] = v;
    else if (isObj(v)) out[k] = filled(v, from[k]);
    else if (v !== null && typeof from[k] !== typeof v) out[k] = v;
  }
  return out as T;
}
