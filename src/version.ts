/**
 * This build, from vite.config.ts: the release tag (v1.0.0), or on dev and next
 * the commits since it (v1.0.0-14-gabc1234), "-dirty" with uncommitted changes.
 * Node tests run the sources without Vite, hence the fallback.
 */
export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
