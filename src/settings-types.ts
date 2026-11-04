// The shapes of the Settings pages: their rows, tabs and Reset all.

/**
 * A setting row: a choice stepped through with < and >, a slider (`def`: its
 * default, marked on it), a value to read (info) or a button (action). `desc` is an optional line under it, `note` a callout
 * (recommendations), `cost` how much the setting can change how smoothly the
 * game runs, whatever its value.
 */
type RowBase = { label: string; desc?: string; note?: string; cost?: Cost };
export type Cost = 'LOW' | 'MEDIUM' | 'HIGH';
export type SettingRow =
  | { kind: 'heading'; label: string }
  | (RowBase & { kind: 'choice'; value: () => string; step: (d: number) => void; locked?: () => boolean })
  | (RowBase & { kind: 'info'; value: () => string })
  | (RowBase & { kind: 'action'; button: string; act: () => void; /** The button says this for a moment after it's pressed. */ done?: string; /** The button can be pressed. */ enabled?: () => boolean })
  | (RowBase & { kind: 'range'; min: number; max: number; step: number; def: number; get: () => number; set: (v: number) => void; format: (v: number) => string });
/** A tab that builds its own page (Controls): its rows' column, its footer line and a control top right; `open` readies it each time it shows, `close` when it goes. */
export interface OwnTab {
  rows: HTMLElement;
  foot: HTMLElement;
  corner: HTMLElement;
  open(): void;
  close(): void;
}
export interface SettingSection {
  title: string;
  rows: SettingRow[];
  tab?: OwnTab;
  /** Its Reset all (Controls has its own). */
  reset?: SectionReset;
}

/** `what`: the section's settings, as Reset all asks about them. */
export interface SectionReset {
  what: string;
  isDefault: () => boolean;
  reset: () => void;
}
