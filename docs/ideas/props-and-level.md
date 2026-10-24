# Props, the level plan and paint pages (audit M7, not started)

From the audit of 2026-10-17 (module M7, skipped for 1.4.0). Nothing decided. ★ marks the audit's recommended approach. Line numbers as of dev 23f7835.

## What exists

- Every prop is one declarative build(ctx) → Piece[] (`src/kit/def.ts:59-92`); game and server share the level plan (`src/level/prop-pieces.ts:46`). A new prop kind needs 2 touch points.
- Triangles are not the problem: props and joints are 127k triangles, the city 158k plus 71k pen lines; the main pass at spawn is 362–379k triangles in 134–254 draw calls; the GPU is limited by pixels. The most tessellated prop is the water tank at 24 segments; rods have 6 sides and are 28% of prop triangles, but cheaper rods would change the look.
- Hidden faces: 913–980 of 8,654 paint faces (11%, 4.4–4.7% of area). Removing them: pages 49 → 46 at ULTRA (−64 MB), but 358–374 surfaces change shape and saved paint on them is skipped on load. Measured by running planLevel as game and server do (1,219 surfaces, 49 pages), sampling paint triangles ~8 cm apart against boxes, joints, cylinders and cones.

## Findings

- **F7.1 Files over the 400-line limit** (refactor). `src/debug/hint-text.ts` is 419 lines (build-prop.ts was split since). BL-038's list is out of date.
- **F7.2 BL-034's memory estimate** (docs). Every page is laid out at load and made on the first hit, so the ceiling is the page count: 49 × 21.25 MiB = 1041 MB at ULTRA (what the playtest measured at 58% painted), not 1.5–2 GB. `src/page-packer.ts`; `src/paint-gpu.ts`.
- **F7.3 Hidden faces stay paintable (cover.ts gaps)** (perf, S–M). A strict inside test misses faces on block seams; joints never cover; cylinders neither cover nor get covered. Fixing all three takes pages 49 → 46 (−64 MB), but 26–28% of the paintable area changes shape and saved paint there is skipped. `src/level/cover.ts:9,69-71`; `src/level/build-prop.ts:203`; `src/kit/pieces.ts:83-95`. Do it after F7.4.
- **F7.4 Saves match surfaces by shape, not by face** (decision, M). Load paint by face geometry (faceKey, as carry does) instead of a hash of the surface's shape, so improving the level plan stops invalidating saves. Touches the painting system: the owner's call. `src/save/shape.ts`; `src/painting.ts:382`.
- **F7.5 PropContext is built four ways** (refactor). Level plan, build ghost (seed 0, no finish), extent (no rot/adjust/text/mirror, cached per type|variant|rot) and icon (below: true) build it with different defaults. One "instance → pieces" function. `src/level/prop-pieces.ts:32`; `src/build/ghost.ts:43`; `src/build/extent.ts:15`; `src/build/prop-icon.ts:15`.
- **F7.6 Placement is a bag of fields** (arch, M). snap is ignored for edge and cell props; vSnap means base-height step or stacking step; hang only for mount, footprint and anchorTop only for cell; variants can switch placement. Rules in six files. `src/kit/def.ts:17-23,70`; `src/build/placement.ts:42-101`; `src/level/stacks.ts`; `src/level/joints.ts`. A discriminated union, later.
- **F7.7 Prop categories in build mode** (BL-055). 11 kit categories mixed with 2 build-only ones; order is the global KIT order; rooftop holds 8 unrelated entries. Near-duplicates (floodlight / roof_light:flood, cable / cable_run, pipe / drain_pipe, stairs / steel_stair) could merge into variants via RENAMED. `src/kit/def.ts:14-15`; `src/kit/index.ts:21,77`.
- **F7.8 Two text mechanisms for signs** (arch, M). 53 of 156 variants are slogans used as variant ids; small_sign and neon use PropDef.text. `src/kit/lettering.ts:19`.
- **F7.9 Paint pages and batches group by different tiles** (arch). Pages group by each surface's tile, batches by the prop's tile: 4 roof surfaces land in another tile's batch. `src/level/build-prop.ts:350`; `src/level/batches.ts:81`.
- **F7.10 Covered faces are still drawn as decor** (perf, low value). 1,653 boxes, 8.3k triangles, never visible. `src/level/build-prop.ts:265-266`. Drop them with cover v2.
- **F7.11 Cylinder paint thresholds are inline** (refactor). 0.3 m radius / 1 m length inline; boxes use PAINT.minFaceSide/minFaceArea. CylPiece has no caps/skip, so round ducts can't drop their ends. `src/kit/pieces.ts:83-95`. Into PAINT, with cover v2.
- **F7.14 Paint pages are 44% full** (perf, M). Faces fill 61% of surface atlases and atlases fill 72% of pages. Better atlas widths cut texels 26% but pages only 49 → 46 at ULTRA and worse at 48 texels/m: the per-tile page packer is the bottleneck. `src/page-packer.ts:42`. Judge on page counts.
- **F7.15 Water tank roofs can't be painted** (BL-106). Cones have no `paint` option and no paint mapping; the paintable flat top sits hidden inside the cone. `src/kit/equipment.ts:26`; `src/kit/pieces.ts:222`.

## Order (audit plan)

1. A design run on props and the level plan: one module for "what covers what"; where "instance → pieces" lives and PropContext's defaults; placement as a discriminated union (may a variant change placement kind?); new type versus variant and the near-duplicates; sign text as variants or text; should saves match faces by geometry (decision only). Look, gameplay and painting unchanged.
2. Prop categories in build mode (BL-055): the registry owns grouping; build-only categories split out; near-duplicates merged as decided; levels still load (RENAMED).
3. Cover v2 and fuller pages (F7.3, F7.10, F7.11, F7.14), only after F7.4 is decided: page counts before and after at each paint detail, golden paint updated on purpose, saves still load.

## BL-106 Water tank roofs can't be painted

The cone roofs of the water tank and the tanks on stands (`p.cone`, `src/kit/equipment.ts`, `src/kit/steel.ts`) have no paint option or mapping; the paintable flat top sits hidden inside. Do: a cone paint mapping, checked against saves and page counts.
