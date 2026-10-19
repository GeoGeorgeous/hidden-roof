# Avatar (BL-056 to BL-060)

Order: BL-056, then 057, 058, 059; BL-060 needs only 056.

## BL-056 New character avatar with a correct rig

The brief the current figure (`src/avatar/`) was built to, still the bar for a new one:

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

## BL-057 Two body types: male and female

Blocked by: BL-056; Status: Blocked, priority Low, size L

(no body in the backlog)

## BL-058 Clothing attached as meshes

Blocked by: BL-056, BL-057; Status: Blocked, priority Low, size L

Hoodies, tank tops, pants, sweatshirts, caps, bandanas and boots.

## BL-059 UI for character customization

Blocked by: BL-058; Status: Blocked, priority Low, size M

(no body in the backlog)

## BL-060 Avatar for NPCs, first-person hands, hood outside F3

Blocked by: BL-056; Status: Blocked, priority Low, size L

NPCs moving around, talking, helping; first-person hands from the avatar's hand; the hood up or down outside F3.
