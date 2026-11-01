// Build-time constants, set in vite.config.ts.
declare const __VERSION__: string;
declare const __DEV_TOOLS__: boolean;
/** The release tags with a picture in public/updates (a patch may have none). */
declare const __PICTURES__: string[];
/** RENDER.minViewport (src/boot.ts reads it without loading config.ts). */
declare const __MIN_VIEWPORT__: { w: number; h: number };
/** RENDER.minViewportCheck and RENDER.linkCopied, for src/boot.ts likewise (ms). */
declare const __BOOT_TIMES__: { check: number; copied: number };
