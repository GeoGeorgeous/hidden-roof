<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/logo-paper.png">
    <img src="docs/img/logo-ink.png" alt="Hidden Roof" width="420">
  </picture>
</p>

<p align="center">a graffiti game in your browser · <a href="https://roof.hidden.haus">roof.hidden.haus</a></p>

hidden roof is a small first-person graffiti game. you climb onto the rooftops of a city drawn in ink, and the only color in it is the paint you bring. there are no enemies and no goals: find your tools, paint whatever you like, scrub it off, paint again. or bring a friend and paint the same roof together.

it's an experiment: i built it with ai tools, to see how far a game like this could go.

## playing

**tools** · a spray can with four caps (skinny, standard, fat, a soft mist), a marker, a stepladder, a paint roller and a sponge. you start with the can and black. the other eight colors, the caps and the tools are hidden around the roof.

**controls** · wasd to move, shift to run, space to jump, ctrl to crouch. the left button paints, the right one shakes the can. 1–5 switch tools, q and e switch colors, the wheel changes the cap or the width. esc pauses.

**together** · host a session from the menu and send the five-letter code. a friend joins with it, and you paint the same roof.

**inspired by** · [Bombing!!: A Graffiti Sandbox](https://store.steampowered.com/app/1527520/Bombing_A_Graffiti_Sandbox/), [Bombing!! 2: A Graffiti Paradise](https://store.steampowered.com/app/2109570/Bombing_2_A_Graffiti_Paradise/) and [Marc Eckō's Getting Up: Contents Under Pressure](https://store.steampowered.com/app/260190/Marc_Eckos_Getting_Up_Contents_Under_Pressure/). the look comes from the pen-and-ink cities of Daisuke Tajima's *Beyond the Lines* ([the exhibition](https://art-view.roppongihills.com/en/shop/adgallery/tajima/), [on tokyo art beat](https://www.tokyoartbeat.com/en/events/-/Daisuke-Tajima-Beyond-the-Lines/49897F3F/2022-09-16)).

## how it's built

three.js, typescript and vite, with no asset files: geometry, textures and sounds are all made in code. one rule comes first: painting the whole level costs the same per frame as painting nothing.

**prop kit** · every prop is a function that returns simple pieces: boxes, cylinders, rods and climb volumes. the same pieces become the meshes, the colliders, the ladders and the paintable faces. props turn in quarter turns, so every collider is an exact box.

**level json** · a level is a spawn, props on a 2 m grid with 4 m storeys, and pickups. build mode (b) edits it in the game and saves it back. the city around it is generated from a seed.

```json
{
  "version": 3,
  "spawn": { "pos": [0, 0, 5], "yaw": 0 },
  "props": [{ "id": 1, "type": "building", "pos": [-7, 0, -5], "rot": 0 }],
  "pickups": [{ "kind": "color:red", "pos": [-3, 0, 6] }]
}
```

**painting** · paint is baked into textures, as in bombing!!, at the same density everywhere (up to 1 cm a texel), and many surfaces share one texture, so a painted roof draws as fast as a clean one. spray particles are only for show: each one stamps paint where it lands, and only the changed part of a texture is uploaded. paint runs, crosses the seams between props, and comes off with the sponge.

**rendering** · ink on paper. each pixel's tone picks paper, hatching, cross-hatching or black, with hatch lines laid out in the world and filtered by their size on screen, so nothing turns to gray mush in the distance. pen outlines come from the depth buffer. paint is the only color.

**lights** · lamp light is baked, with shadows, so a hundred lamps cost what one does. only moving lights, the cctv cameras, are real-time. rain, lightning, fog and flickering neon go on top.

**files**

```
src/kit            props as pieces
src/level          pieces into meshes, colliders and batches
src/painting.ts    paint textures, stamps, uploads
src/render         the ink look, baked light, post
src/city           the generated city
src/net, server/   multiplayer
src/config.ts      every tunable number
public/levels      level json
```

```sh
npm install
npm run dev      # localhost:5173
npm run check    # everything, before a commit
```

every control, prop and setting is in [docs/reference.md](docs/reference.md).
