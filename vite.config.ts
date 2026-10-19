import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };
import { LEVELS, RENDER } from './src/config.ts';

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

// The player build ships only the release levels (LEVELS.release in config.ts), each with its own paint if it has some (src/save/level-paint.ts).
const releaseLevels = {
  name: 'release-levels',
  apply: (_: unknown, env: { mode: string; isSsrBuild?: boolean }) => env.mode === 'production' && !env.isSsrBuild,
  writeBundle(options: { dir?: string }) {
    const dir = `${options.dir}/levels`;
    for (const file of readdirSync(dir)) if (!LEVELS.release.includes(file.replace(/\.(json|rhhpaint)$/, ''))) rmSync(`${dir}/${file}`);
  },
};

// The player build ships no comments of ours: the HTML's (stripped by gamePreload) and the GLSL's, which Vite
// keeps inside the template literals tagged /* glsl */. Each literal's ${...} are set aside while the comments go,
// and every line that ends a non-empty line keeps its newline (the preprocessor lines stay lines). A literal with an
// escape, an interpolation holding a quote or a backtick, or one inside a comment, is left as it is.
const GLSL_TAG = /\/\* glsl \*\/\s*`/g;
const SLOT = '\uE000';
function stripGlslLiteral(code: string, start: number): { end: number; text: string } | null {
  const holes: string[] = [];
  let text = '';
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === '`') {
      const bare = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => (m[1] === '*' ? ' ' : ''));
      // An interpolation inside a comment would go with it, and the rest would shift.
      if (bare.split(SLOT).length - 1 !== holes.length) return null;
      const lines = bare.split('\n');
      const last = lines.length - 1;
      const kept = lines.filter((l, n) => n === 0 || n === last || l.trim() !== '').map((l, n, all) => (n === all.length - 1 ? (all.length > 1 && l.trim() === '' ? '' : l) : l.trimEnd()));
      return { end: i, text: kept.join('\n').replaceAll(SLOT, () => holes.shift()!) };
    }
    if (c === '\\' || c === SLOT) return null;
    if (c === '$' && code[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      for (; j < code.length && depth > 0; j++) {
        if (/['"`]/.test(code[j])) return null;
        depth += code[j] === '{' ? 1 : code[j] === '}' ? -1 : 0;
      }
      if (depth > 0) return null;
      holes.push(code.slice(i, j));
      text += SLOT;
      i = j - 1;
    } else text += c;
  }
  return null;
}
const stripComments = {
  name: 'strip-comments',
  apply: (_: unknown, env: { mode: string; isSsrBuild?: boolean }) => env.mode === 'production' && !env.isSsrBuild,
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.endsWith('.ts') || id.includes('node_modules') || !code.includes('/* glsl */')) return null;
    let out = '';
    let at = 0;
    for (const tag of code.matchAll(GLSL_TAG)) {
      const start = tag.index! + tag[0].length;
      if (start < at) continue;
      const lit = stripGlslLiteral(code, start);
      if (!lit) continue;
      out += code.slice(at, start) + lit.text;
      at = lit.end;
    }
    return out + code.slice(at);
  },
};

// The Content Security Policy roof.hidden.haus sends (docs/deploy.md), `hash` the
// one inline script's (csp-hash.txt; Caddy reads it per request). data: for the
// hotbar's blank icon (inventory/thumbnails.ts), blob: for downloads and screenshots.
const csp = (hash: string) => `default-src 'self'; script-src 'self' ${hash}; img-src 'self' data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
const HASH_FILE = 'csp-hash.txt';

// index.html's inline script starts the game's files coming with the page
// (src/boot.ts would ask for them only once it runs): the build names them in
// its meta tag, with RENDER.minViewport, and writes the script's CSP hash to
// csp-hash.txt; vite preview sends the CSP with it, as Caddy does.
type Chunk = { type: string; fileName: string; facadeModuleId?: string | null; imports?: string[]; viteMetadata?: { importedCss: Set<string> } };
const gamePreload = () => {
  let hash = '';
  return {
    name: 'game-preload',
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string, ctx: { bundle?: Record<string, Chunk> }) {
        if (!ctx.bundle) return html;
        const bundle = ctx.bundle;
        html = html.replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, '');
        const main = Object.values(bundle).find((c) => c.type === 'chunk' && c.facadeModuleId?.endsWith('/src/main.ts'));
        if (!main) throw new Error('game-preload: no chunk for src/main.ts');
        // The game's chunk, the chunks it imports and their CSS: what boot.ts's import('./main') fetches.
        const files = new Set<string>();
        const add = (c: Chunk) => {
          if (files.has(c.fileName)) return;
          files.add(c.fileName);
          c.viteMetadata?.importedCss.forEach((css) => files.add(css));
          c.imports?.forEach((f) => add(bundle[f]));
        };
        add(main);
        const meta = '<meta name="game-files" content="" />';
        if (!html.includes(meta)) throw new Error('game-preload: no game-files meta in index.html');
        html = html.replace(meta, `<meta name="game-files" content="${[...files].map((f) => `/${f}`).join(' ')}" data-min='${JSON.stringify(RENDER.minViewport)}' />`);
        const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
        if (scripts.length !== 1) throw new Error(`game-preload: ${scripts.length} inline scripts in index.html, the CSP allows one`);
        hash = `'sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}'`;
        return html;
      },
    },
    writeBundle(options: { dir?: string }) {
      if (hash) writeFileSync(`${options.dir}/${HASH_FILE}`, `${hash}\n`);
    },
    configurePreviewServer(server: { config: { build: { outDir: string } }; middlewares: { use: (f: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      const built = readFileSync(`${server.config.build.outDir}/${HASH_FILE}`, 'utf8').trim();
      server.middlewares.use((_req, res, next) => (res.setHeader('Content-Security-Policy', csp(built)), next()));
    },
  };
};

// The game builds with Vite's defaults. The multiplayer server (server/) is
// built as one file with everything in it (vite build --ssr), so its image
// needs no node_modules, nor the game's public files; in dev, /ws goes to a
// server started with npm run server (WS_TARGET: another one, for tests).
// The dev tools (src/dev: build mode, F3, window.game) are in the dev server and
// npm run build:dev; npm run build, the player build, leaves them out.
export default defineConfig(({ mode, isSsrBuild }) => ({
  plugins: [releaseLevels, stripComments, gamePreload()],
  define: { __VERSION__: JSON.stringify(version()), __DEV_TOOLS__: JSON.stringify(mode !== 'production'), __MIN_VIEWPORT__: JSON.stringify(RENDER.minViewport) },
  ssr: { noExternal: true },
  build: { copyPublicDir: !isSsrBuild },
  server: { proxy: { '/ws': { target: process.env.WS_TARGET ?? 'ws://localhost:3000', ws: true } } },
  // vite preview serves the player build as production does (docs/deploy.md, the Caddy block; the CSP: gamePreload).
  preview: { proxy: { '/ws': { target: process.env.WS_TARGET ?? 'ws://localhost:3000', ws: true } } },
}));
