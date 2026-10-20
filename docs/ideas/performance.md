# Performance: measurements and next steps

Performance measurements and what to do next.

## BL-029 The roof level's edits of 2026-10-10 cost a little

Two edits (lamps, signs, ducts, 4 clear windows; then railings, parapets, roof lights, skylights, ducts: 1373 → 1464 props). At six fixed views at 1280×720 on a quiet machine (median of 3 runs, `next` before them vs `dev` after): Intel UHD GPU time +3–9% (14.3–17.0 → 15.6–17.7 ms, scene + post), CPU +0.4–1.4 ms, draw calls +4–21% (128–374 → 133–422), triangles +8%. On the A2000 the GPU barely moves (±6%). The extra calls are merged tile batches (more materials and finishes per tile) and glass: no draw call per prop. Not urgent; if the weak GPU needs room, fewer material and finish variants per tile first.

## BL-032 One load of the roof took 62 s

On the real GPU (headed Chromium on WSLg, its own Vite server); 8 other loads took 4.8–5.8 s, and 3 reruns didn't show it again. Cause not found. If a player reports a long load, start here.

## BL-034 Paint pages at ULTRA use ~0.95 GB of GPU memory

After 40 minutes of painting at ULTRA a profile counted 45 more GPU textures (~0.95 GB if paint pages). Confirmed by the playtest of 2026-10-12: 49 paint pages, 1041 MB of GPU memory at 58% of the level painted; all painted would be an estimated 1.5–2 GB. Already so in 1.1.0.

Owner (2026-10-20): no change that lowers paint quality or detail (no fewer texels, no lossy compression, no fewer mip levels); skip the task if there's no such way.

How the memory adds up (2026-10-20): every surface gets its block on a page of its level tile when the level loads (`PagePacker`, `src/page-packer.ts`); a page's texture is made on the first hit on any of its surfaces: 2048² RGBA8 plus its levels, ~21 MB, the same at every PAINT DETAIL (detail changes how many pages the level needs: ULTRA 16x LOW). Coats cost nothing: painting a wall red again, or with a roller and then a can, writes the same texels. So the memory is the pages touched, at most every page of the level; the waste is the empty part of each page (44% full) and a whole page made for one small hit. Lossless options: (1) measure how full each page is and where its empty part is; (2) make a page's texture only as tall as its blocks reach (shelf packing fills from the top), if most of the waste is at the bottom; (3) smaller pages at ULTRA (a first hit costs less, more draw calls: measure); (4) pack fuller, BL-144. Measured (2026-10-20, the roof's paint surfaces packed in Node as the client packs them, per tile): LOW 8 pages, 171 MB if all are made; MEDIUM 17, 363 MB; HIGH 30, 640 MB; ULTRA 49, 1045 MB. Blocks fill 39/59/69/72% of the pages; cropping each page to the rows its blocks use would save 32/15/10/9%, perfect packing 61/41/32/28%. The playtest's 49 pages and 1041 MB were already every page the level has: 1 GB at ULTRA is the ceiling, not on its way to 2 GB. Cropping isn't worth its cost (a texture that grows when build mode adds a block, UVs per page height); the rest of the waste is inside the shelves, which is BL-144's job (pack fuller, drop hidden faces). Moved out of 1.5.0.

## BL-108 Loading drops to 12 fps on the Intel UHD with Energy Saver on

Intel UHD laptop, Chrome's Energy Saver on: 30 fps in play, but 12 fps and CPU 18–24 ms while the game loads (likely shader compiles and uploads). Do: measure the load with `npm run bench` on the Intel UHD (BL-084) before deciding.

Measured (2026-10-18, `npm run bench` on the bundled build, WSL, no Energy Saver: it can't be turned on there): the load takes 3.9 s on the Intel UHD (the longest frame 1.6 s) and 2.7 s on the RTX A2000 (1.1 s). The steps block by design, so few frames on either GPU. (A first measurement through the dev server, 7.9 and 5.3 s, was mostly Vite compiling modules: audit F2.13.) Next: the same on the Windows laptop with Energy Saver on, then decide.
