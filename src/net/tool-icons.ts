import { SLOTS, type Tool } from '../inventory/tool';

// The tools a session allows, as the server list and its dialogs show them:
// a 16 px line icon each (from the designer's handoff, in the text color) and
// its name, in slot order.

const SHAPES: Record<Tool, string> = {
  can: '<rect x="4.5" y="5.5" width="6" height="8.5" rx="1.5"/><path d="M6 5.5V3.5h3v2"/><path d="M10.5 3.2l2-.8M10.5 4.4l2 .2"/>',
  marker: '<path d="M3 13l.8-2.8 6.6-6.6 2 2-6.6 6.6z"/><path d="M9.2 4.8l2 2"/>',
  ladder: '<path d="M5 2v12M11 2v12M5 5h6M5 8h6M5 11h6"/>',
  roller: '<rect x="2.5" y="2.5" width="9" height="3.5" rx="1"/><path d="M11.5 4.2h1.7v3.3H7.5v2"/><path d="M7.5 9.5v4"/>',
  sponge: '<rect x="2" y="6" width="9.5" height="7" rx="2.5"/><circle cx="4.8" cy="8.6" r="0.6" fill="currentColor" stroke="none"/><circle cx="7.6" cy="10.6" r="0.6" fill="currentColor" stroke="none"/><circle cx="8.4" cy="8.2" r="0.5" fill="currentColor" stroke="none"/><path d="M13 2.2c.9 1.2 1.4 2 1.4 2.6a1.4 1.4 0 0 1-2.8 0c0-.6.5-1.4 1.4-2.6z"/>',
};

export const TOOL_NAMES: Record<Tool, string> = { can: 'Can', marker: 'Marker', ladder: 'Ladder', roller: 'Roller', sponge: 'Sponge' };

/** The tools in slot order. */
export const TOOLS: readonly Tool[] = SLOTS;

/** A tool's icon as inline SVG markup, in the text color (currentColor). */
export function toolIcon(tool: Tool) {
  return `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SHAPES[tool]}</svg>`;
}
