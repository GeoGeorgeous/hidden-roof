// The tools, in slot order (1 = can, 2 = marker, 3 = stepladder, 4 = roller, 5 = sponge). A leaf with no
// imports, so config.ts keys its tool tables by `Tool`: a tool left out of one fails to compile.
// The snapshot gives the tool 3 bits (its slot + 1, net/snapshot.ts): more than 7 slots fail here.
export const SLOTS = ['can', 'marker', 'ladder', 'roller', 'sponge'] as const satisfies { length: 1 | 2 | 3 | 4 | 5 | 6 | 7 };
export type Tool = (typeof SLOTS)[number];
