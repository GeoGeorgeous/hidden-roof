import { defineConfig } from 'vite';

// The game builds with Vite's defaults. The multiplayer server (server/) is
// built as one file with everything in it (vite build --ssr), so its image
// needs no node_modules, nor the game's public files; in dev, /ws goes to a
// server started with npm run server (WS_TARGET: another one, for tests).
export default defineConfig(({ isSsrBuild }) => ({
  ssr: { noExternal: true },
  build: { copyPublicDir: !isSsrBuild },
  server: { proxy: { '/ws': { target: process.env.WS_TARGET ?? 'ws://localhost:3000', ws: true } } },
}));
