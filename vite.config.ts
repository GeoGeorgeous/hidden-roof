import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// The build's version (src/version.ts): git describe from the last release tag,
// prefixed with package.json's version until the first tag exists; just that
// version where there's no git (the server's Docker build has no .git).
function version(): string {
  const release = `v${pkg.version}`;
  try {
    const described = execSync('git describe --tags --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return described.startsWith('v') ? described : `${release}-g${described}`;
  } catch {
    return release;
  }
}

// The game builds with Vite's defaults. The multiplayer server (server/) is
// built as one file with everything in it (vite build --ssr), so its image
// needs no node_modules, nor the game's public files; in dev, /ws goes to a
// server started with npm run server (WS_TARGET: another one, for tests).
// The dev tools (src/dev: build mode, F3, window.game) are in the dev server and
// npm run build:dev; npm run build, the player build, leaves them out.
export default defineConfig(({ mode, isSsrBuild }) => ({
  define: { __VERSION__: JSON.stringify(version()), __DEV_TOOLS__: JSON.stringify(mode !== 'production') },
  ssr: { noExternal: true },
  build: { copyPublicDir: !isSsrBuild },
  server: { proxy: { '/ws': { target: process.env.WS_TARGET ?? 'ws://localhost:3000', ws: true } } },
}));
