// Build-time constants, set in vite.config.ts.
declare const __VERSION__: string;
declare const __DEV_TOOLS__: boolean;
/** The release tags with a picture in public/updates (a patch may have none). */
declare const __PICTURES__: string[];
/** RENDER.minViewport (src/boot.ts reads it without loading config.ts). */
declare const __MIN_VIEWPORT__: { w: number; h: number };
