// The client's text atlases (render/ink/text-atlas.ts) draw sign lettering into
// a canvas. The server builds the same props for their paint faces, which never
// depend on what's drawn (sign sizes come from a width table, words.ts), so a
// canvas that draws nothing stands in for the DOM. Import before anything that
// builds props.

const context = new Proxy({} as Record<string | symbol, unknown>, {
  get: (_, key) => (key === 'measureText' ? () => ({ width: 0 }) : () => {}),
  set: () => true,
});

const canvas = () => ({ width: 0, height: 0, getContext: () => context });

(globalThis as { document?: unknown }).document ??= { createElement: canvas };
