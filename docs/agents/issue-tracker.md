# Issue tracker: docs/backlog.md

Work items live in one file, `docs/backlog.md`, the one list. No GitHub Issues, no `.scratch/`. Pull requests are not a request surface.

## Item format

Each item is a `###` heading (the title) followed by a `- key: value` list, then free prose (what, what showed it, where, what to do). Look at the items already in the file and follow them.

- `id`: `BL-NNN`, next free number, never reused or renumbered. If two branches took the same number, the one merged later renumbers its item
- `type`: `bug | feature | idea | chore | refactor | perf | test | docs`
- `status`: `Requested | Planned | In Progress | Blocked | Done`
- `priority`: `Urgent | High | Medium | Low`
- `size`: `XS | S | M | L` (XS minutes, S hours, M half a day, L more)
- `area`: `net | render | paint | input | ui | level | build | deploy | audio | avatar | seo | marketing`
- `release`: `next | later | X.Y.Z`
- `blocked-by` (optional): ids of items that must be done first
- `source` (optional): what showed it (a playtest, a review, the owner)

## When a skill says "publish to the issue tracker"

Append a new item at the end of `docs/backlog.md`, in the format above. A spec or a long brief goes into its own file under `docs/`, linked from the item.

## When a skill says "fetch the relevant ticket"

Read the item with that `BL-NNN` id in `docs/backlog.md`.

## Triage state

The triage roles live in the `status` line (see `triage-labels.md`). Comments and triage notes go in the item's prose, under a `Triage notes` line.

## Done

An item is marked `Done` when it ships; the release commit deletes the `Done` items (git keeps the history). Rejected items (`wontfix`) are deleted at once; the reason goes in the commit, or in `docs/known-limits.md` if it is a limit by design.

## Wayfinding

For `/wayfinder`: a map is a doc `docs/<effort>-map.md`; each child ticket is a backlog item with `type: idea` and `blocked-by` listing its blockers. A ticket is unblocked when every item it lists is `Done` or deleted.
