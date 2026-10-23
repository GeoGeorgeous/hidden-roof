# HUD scale and the compact menu

Left over from the hints work (checked 2026-10-22 on the roof level, real GPU). Each item is checked and closed on its own.

## TASK-203: the HUD scales with the window and the DPR

Everything in the HUD is px. At **3840×2160 with DPR 1** the HUD is a sliver: 11 px text on a 2160 px screen, the hotbar 30 px (`docs/img/tutorial/4k-3840x2160-busy-hud.jpg`). A 4K laptop at DPR 1.5–2 is fine: it's 1920–2560 CSS px. At **820×560** it is crowded (`docs/img/tutorial/min-820x560-busy-hud.jpg`). Ultrawide 3440×1440 is fine: the corners are far out, the tool stack near the center (`docs/img/tutorial/ultrawide-3440x1440-busy-hud.jpg`). No HUD size setting yet.

## BUGS-199: LOW PRESSURE off the right edge at 820×560

The tool stack (`.tool-stack`, `hud.ts`) starts right of center and only grows rightward, so the alert reads "…TO SH" (`docs/img/tutorial/min-820x560-busy-hud.jpg`). It must grow so it stays on screen.

## BUGS-198: the compact pause menu under the HUD

With F3 open the pause menu is compact (`body.paused` off), and the pickup tags, nameplates, hotbar and toasts used to draw over its buttons. The layers are now tokens (`--z-*` on `:root` in `boot.css`, the menu at `--z-menu` above the world, tool, hint, event and hotbar layers): check it in the game before closing.
