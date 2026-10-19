# A shared tool type (audit M6, not started)

From the audit of 2026-10-17 (module M6, skipped for 1.4.0). Nothing decided. ★ marks the audit's recommended approach. Line numbers as of dev 23f7835.

## What exists

- A tool is the string 'can' | 'marker' | 'ladder' | 'roller' | 'sponge' plus its index in SLOTS (`src/inventory/inventory.ts:8-9`). Five classes, five update signatures; tools.ts dispatches with 25 === checks.
- Adding a sized color tool touches 18 files plus 2 new, ~40 places plus ~12 F3 tooltips; only 6 fail to compile if forgotten.
- Update order is part of the contract: the marker silences the shared scribble channel, and the can's particles keep stamping while another tool is out, so the order fixes the op log and replays.
- Paint ops know nothing about tools: the painting layer is the clean part.

## Findings

- **F6.1 Make the tool lists exhaustive** (refactor, S). Tool and SLOTS in a leaf module; key HOLD, MODELS, PICKUP.models and KANA by the union; if-chains become Record<Tool,…> or a switch with a never default; one SIZED map; a static check SLOTS.length ≤ 7. About 10 silent spots become compile errors; behavior identical. `src/inventory/inventory.ts:8-11`; `src/tools/tools.ts`; `src/pickups/visuals.ts:136-150`; `src/config.ts:601,715`.
- **F6.2 Silent defaults for a missing tool** (latent bug, fixed by F6.1). A tool missing from itemModel is drawn as a marker; one missing from PICKUP.models throws every frame (hidden by a cast); one missing from KANA shows a blank line. `src/pickups/visuals.ts:150`; `src/pickups/pickups.ts:43-46,113`; `src/pickups/labels.ts:20-41,143`.
- **F6.3 Three bits for the tool in the snapshot** (latent bug). An 8th SLOTS entry would spill into the action bits; nothing checks it. `src/net/snapshot.ts:52`. A static check with F6.1.
- **F6.4 Update order is an unwritten rule** (arch). The marker writes scribble 0 every frame it isn't drawing, so it must update before the roller and sponge; the can's particles keep stamping while another tool is out. `src/tools/marker.ts:61`; `src/tools/tools.ts:90`; `src/spray/particles.ts:172`. Approaches: (1) document the rule in tools.ts ★ · (2) tools report sound levels, Tools mixes once (later).
- **F6.5 Other players' tools don't match** (cosmetic). Figures always hold a roller at ROLLER.width (the snapshot has no size); the sponge's pickup tilt carries into the figure's hand; the figure's ladder is a separate model that ignores MODELS.ladder. `src/pickups/visuals.ts:145-149`; `src/avatar/held.ts:28-40,83-98`. Approaches: (1) fix tilt and ladder model (no protocol change) ★ · (2) also the roller size (snapshot field, protocol bump) · (3) leave it.
- **F6.6 Tool names drift** (docs). ladder / stepladder / LADDER and two F3 groups; can / SprayTool / color:* pickups; the action "spray" also covers the marker. `src/tools/ladder-tool.ts:39`; `src/inventory/items.ts:20`; `src/debug/panel.ts:27,35`.
- **F6.7 A tool registry and a HeldTool interface** (arch, M). The HeldTool seam is real (5 adapters); a ToolDef that swallows poses, HUD, sound and F3 would be a shallow god-record. Caps are the template for marker types: a per-tool variant module is the deep module to build with BL-039. Do it when BL-039, BL-042 or BL-074 is planned.
- **F6.8 No color or cap tag when switching from an empty slot** (question). switched is false when prev.tool is null, so no tag shows coming from an empty slot or from build mode. Possibly on purpose. `src/tools/tools.ts:126-127`.

## Questions for a design run (when a new tool is planned)

Where do Tool and its order live (config.ts keys by it, protocol.ts never imports models)? The smallest ToolFrame; is the stepladder a HeldTool? Is the can's cap the template for marker types, brushes, stencils? Should tools report sound levels and Tools mix once? Which outside reaches into Tools belong on its interface? Which rules does the interface state outright (order, 3 bits, ids in level JSON)?
