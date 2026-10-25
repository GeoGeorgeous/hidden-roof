// The menus' line icons. `broadcast` and `refresh` are Tabler Icons 3.49.0 outline icons (MIT, Paweł Kuna; public/licenses/tabler-icons.txt), 24×24 at stroke 2; the rest are the designer's own, on a 16×16 grid at stroke 1.4 like the tool icons (net/tool-icons.ts).

const TABLER: Record<string, string> = {
  broadcast: '<path d="M18.364 19.364a9 9 0 1 0 -12.728 0"/><path d="M15.536 16.536a5 5 0 1 0 -7.072 0"/><path d="M12 13m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
};

const DESIGNED: Record<string, string> = {
  globe: '<circle cx="8" cy="8" r="5.8"/><ellipse cx="8" cy="8" rx="2.4" ry="5.8"/><path d="M2.2 8h11.6"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  cross: '<path d="M4 4l8 8M12 4l-8 8"/>',
};

/** A Tabler icon (`broadcast`, `refresh`) as 16 px inline SVG markup, in the text color (currentColor). */
export function tablerIcon(name: keyof typeof TABLER) {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TABLER[name]}</svg>`;
}

/** One of the designer's icons (`globe`, `lock`, `check`, `cross`) as inline SVG markup of `size` px, in the text color (currentColor). */
export function lineIcon(name: keyof typeof DESIGNED, size = 16, stroke = 1.4) {
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DESIGNED[name]}</svg>`;
}
