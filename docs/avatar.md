# Avatar: the player figure (multiplayer phase 3, step 4)

## Brief

A reusable procedural humanoid mannequin. First it shows other players in
multiplayer; later the same body serves NPCs (moving around, talking,
helping). This step builds only the body, its outfit and a pose API driven
by state: no AI, pathfinding or dialogue.

**Look**

- Stylized, low-poly, slightly robotic: simple deliberate boxes, no sculpted
  mesh, no Blender or external assets; procedural three.js only.
- A believable humanoid silhouette and proportions: head, torso, pelvis,
  arms, hands with fingers, legs, feet. Anatomically plausible, not
  realistic: shoulders, elbows, hips and knees bend like a person's.
- Generic, not a graffiti artist. Streetwear silhouette: an oversized hoodie
  (hood up or down) and baggy pants, chunky sneakers. Clothing is rigid parts
  on the bones, no cloth simulation; outfits can change without rebuilding
  the body.
- Head: a dummy's, a low-poly egg with two eyes (rounder and less robotic after the first review).
- The ink style (`src/render/ink/AGENTS.md`): neutral grays only, drawn by
  the ink shader. The only color is player paint (the can's label).
  Customization means shapes and gray tones.
- Gloves and sleeves match the first-person hands (`src/spray/hands.ts`).

**Fits the game**

- Its height is `PLAYER.height` and its eyes are at `PLAYER.eyeHeight`, so a
  remote player's head is where their camera is.
- A grip socket in each hand holds any tool (can, marker, roller, sponge,
  folded stepladder).
- Not a collider.

**Performance** (`AGENTS.md`: performance first)

- About 3 draw calls a figure: every body part is rigid and follows one bone
  (skin weight 1), all merged into one skinned mesh with vertex colors and one
  material. The held tool adds one or two.
- Geometry is built once; a frame only turns bones.

**Motion**

- Procedural, from the state multiplayer sends: speed and direction, on the
  ground, vertical speed, crouched, on a ladder, look pitch, tool, action
  (spray, shake, roll, scrub).
- Legs use two-bone IK toward foot targets, so knees bend plausibly; the walk
  phase follows the distance moved, so feet don't slide.
- Poses: idle, walk, sprint (leaning), crouch, in the air, climb, spray (arm
  aimed at the pitch), shake, roller push, sponge circles, carrying the
  ladder. Hands: relaxed, fist, grip, point, open, index on the nozzle.
- Somewhat mechanical motion is fine.

**Code**

- `src/avatar/*`, numbers in `AVATAR` (`config.ts`), files under ~400 lines.
- Reviewed in F3 → Avatar: a test figure in front of you, pose by pose or
  cycling, hood up or down (F3 only for now).

## Decisions (2026-10-06)

| Question | Decision |
|---|---|
| Face | Two eyes are enough for now |
| Hood | Up and down, switchable in F3 only for now |
| Body types | One |
| First-person hands from the avatar's hand | Later, a separate step |

First review: legs slimmer; a rounder dummy's head instead of the robot's; crouching leans forward (it leaned back: a sign error); the spray arm bent at the elbow, elbow a little out; the hoodie down to just below the waist and roomier, clear of the legs when walking; rounded shoulders.

Second review: the spray arm straight out along the look again, as at first; crouched and spraying, the body leans a little back (`crouchSprayLean`); the shoulders round the hoodie's corners instead of cutting into it; the eyes sit out past the egg's facets, so both show from every side.

Third review: the hoodie and sleeves slimmer (the body looked bulky against the head and legs); spraying is the first version's pose again, the arm straight out along the look with the can standing up in the fist (the IK version turned the can's top forward). IK stays for the roller and the sponge.

Fourth review: the shoulders are plain boxes again, as at first (simpler than the balls); the hood up is a smooth egg shell set back from the face, so the face shows in its opening; a long hoodie down to mid-thigh and pants in the hoodie's gray, for a street look (the legs swing through the hem a little).

## What was built

| File | What |
|---|---|
| `src/avatar/rig.ts` | 38 bones: hips, spine, chest, neck, head; per side shoulder-elbow-wrist, a thumb and four fingers (two segments each), hip-knee-ankle |
| `src/avatar/parts.ts` | Rigid low-poly boxes, balls and tapered limbs, each on one bone, merged into one skinned geometry with vertex colors |
| `src/avatar/body.ts` | Head (a low-poly egg with two eyes), neck, gloved hands |
| `src/avatar/outfit.ts` | Fitted long hoodie down to mid-thigh (pocket, drawstrings, cuffs, hood up or down), pants in the hoodie's gray with round hips, sneakers |
| `src/avatar/pose.ts` | `AvatarState` → bone rotations: leg IK, walk phase from distance, layered arm poses, finger grips |
| `src/avatar/arm-ik.ts` | Arm IK for the roller and the sponge: the elbow bends out and down |
| `src/avatar/held.ts` | The tool in the right hand: pickup models at real size, merged; the can's label in its paint color and its cap in the cap's; the nozzle, where other players' spray leaves; the stepladder folded and carried by its rail |
| `src/avatar/avatar.ts` | `Avatar`: `group`, `update(dt, state, color, cap)`, `nozzle`, `setFaded` (a player who's gone), `setOutfit`, `dispose` |
| `src/dev/avatar-preview.ts` | F3 → Avatar: the test figure |

- **Cost:** the body is one draw call (1180 triangles); a tool adds one, the can two (its label). A frame only sets bone angles; geometry is built only when the outfit or the tool changes.
- **Since:** nameplates (`src/net/nameplates.ts`) and facing a ladder (`src/net/remote-player.ts`). First-person hands from this hand: `docs/backlog.md`.

## Review

- In the game: F3 → Avatar → SHOW / HIDE TEST FIGURE. It stands in front of you, facing you, and cycles through 18 poses (3 s each); NEXT POSE stops on one. Walk around it. "hood up" switches the hood.
- Screenshots: `npm run shots:avatar` writes every pose from a chosen angle to `shots/avatar/` and a contact sheet (`shots/avatar/sheet.png`, about 5 minutes on SwiftShader); `ONLY=walk,shake` takes just those.
- `npm run test:game` checks every test pose: at most 3 meshes, finite bones, feet on the floor, a crouch below 1.25 m, the arm up when spraying up.
