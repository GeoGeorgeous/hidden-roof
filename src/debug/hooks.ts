// Side effects the debug panel's rows call, set later by the dev tools (the
// panel is built first). Each function in `call` looks up the hook set at the
// time it runs, so a row may take one by reference.

type Fn = (...args: never[]) => unknown;

export function hooks<T extends Record<string, Fn>>(defaults: T) {
  const set = { ...defaults };
  const call = Object.fromEntries(Object.keys(set).map((k) => [k, (...args: never[]) => set[k](...args)])) as unknown as T;
  return { call, set: (h: Partial<T>) => Object.assign(set, h) };
}
