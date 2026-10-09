# Ink style (src/render/ink)

- Materials are the four neutral grays in `kit/pieces.ts`; the ink turns them into paper, hatching or black.
- The only color in the world is player paint. Never add colored materials, lights, glows or sprites. Exceptions: pickups of paint colors, and lamp kinds with `LIGHTS[kind].tint` above 0, whose hue tints the light on walls (above 1: deep, as the aviation light) and their glow sprites (`render/light-fx.ts`). `INK.tint` scales or switches it all off.
- Signs show real slogans (`Mat.letters`, `slogans.ts`) in the bundled Japanese font: panels from `panel-text.ts`, neon blades from `neon-text.ts`, the city's billboards from `city-text.ts`, small signs real words (`words.ts`).
- Big walls get facade bands (`Mat.facade`).
