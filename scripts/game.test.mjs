// Game tests in the browser: behavior the golden paint test doesn't cover, one module per area in scripts/game/.
// One browser and one page for all of them; the areas run in this order (a few checks build on the one before).
// Usage: node scripts/game.test.mjs [url]   (no url: starts its own server)
//        ONLY=ladder npm run test:game   (only the checks whose name matches: while working; the full run before a merge)
import { finish } from './game/harness.mjs';

await import('./game/menu.mjs');
await import('./game/controls.mjs');
await import('./game/remember.mjs');
await import('./game/files.mjs');
await import('./game/input.mjs');
await import('./game/paint.mjs');
await import('./game/hints.mjs');
await import('./game/tools.mjs');
await import('./game/session.mjs');
await import('./game/ghost.mjs');
await import('./game/debug.mjs');
await finish();
