# Debug panel (src/debug, F3)

## Structure

- **Tab → group → section → row.** A tab is an area of the game (Player, Paint, Items, Models, Look, World, Test). A group is one system or object (Movement, Caps, Pressure). A section is one part of it, started by a heading.
- **General first.** Settings for the whole group come first, in a section titled General; a group with one section titles it General too.
- **Every group is listed in exactly one tab** (`TABS` in `panel.ts`). Never rely on the fallback to the last tab.
- **Group by effect, not by config object.** Put a setting where you'd look for it by what it changes. Concerns that cut across tools (Cursor, Quality, Paint runs, Pressure) get their own group, with one section per tool or cap.
- **Same rows for repeated things.** Each cap, tool, light or pickup gets a section with the same name pattern and the same rows in the same order, generated from config with a shared helper.
- **Feel → quality → looks.** Settings that change how something plays or looks come first. Smoothness-against-cost trade-offs go in a Quality group; purely cosmetic animation goes with its model or held pose; performance stats go in Test.
- **Readouts:** a readout about an object sits at the top of that object's section (position in Movement); global stats go in Test → Performance.
- **Broken or unfinished features are shown, greyed out** (a heading with `disabled: true`), not removed.

## Naming

- **Labels are lowercase, 1–3 words, with no units or notes:** those go in the tooltip. Action buttons are UPPERCASE verbs (RECORD, STRIKE NOW).
- **One vocabulary:** reach (how far it works) · width / size / length (full extents) · opacity (how much paint) · strength (an effect that isn't paint) · softness (a faded edge) · spread (a cone) · density (amount per second) · speed / rate · intensity (a light's brightness) · color · on (an enable toggle). No jargon or internal words in labels: excess, duty, fraction, half-, radius, coats.
- **Full sizes, never halves or radii,** in labels and, when touched, in config (`width`, `dotSize`, `pressLength`).
- **Patterns:** pairs read `x: min` / `x: max`; a state or context comes first (`crouch: lean`, `wheel: step`); instances are named plainly (`skinny cap`, `marker`).

## Tooltips

- **Every value row has one** (`hints.ts`): what it does in play terms, its unit, which way is more ("higher = …"), and any gotcha ("only shows past 1.5 m"). The panel adds the config.ts value itself.
- **Keyed by config path,** `*` for instances (`CAPS.*.strength`). Renaming a config key renames its tooltip in the same commit.

## Values

- **Defaults are config.ts:** every slider shows its default tick, RESET returns to it, and nothing is saved.
- **Ranges:** the default is inside the range and ideally not at either end; min and max are what's sensible to try; the step matches the precision that matters.
- **Each instance holds its own absolute value** (each cap's run frequency), not a global value times per-instance multipliers.
- **Colors:** what is only an ink tone uses a gray slider; real color (paint, caps, lights, signs) uses the color picker.
- **Changes apply live** through the row's side-effect hook. A rebuild too slow to run on every drag gets an action button instead.

## Icons

- **Every tab and group has an icon; a section gets one when it names a thing** (a tool, cap, light). General gets none. Icons are 10×10 line icons in `icons.ts`, in one stroke style.

## Code and process

- **Tunables live in `config.ts`.** Panel contents go in a `*-sections.ts` file per area (each under 400 lines), with shared helpers for repeated rows.
- **Renaming a config key** updates tooltips, tests and code in the same commit. Golden paint must still match, unless the change means to alter paint and the commit says so (`npm run golden -- --update`).
- **Before restructuring a tab,** propose the changes point by point, with options, and let the user decide.
