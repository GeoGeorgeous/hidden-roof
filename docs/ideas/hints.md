# Hints in one voice, and a hint for each new cap

A plan, not started. The owner wants it in 1.7.0.

## One voice

Every line the player reads as the character's own speaks in the first person: "I". Today only `toast.locked` does; the toasts say "You" and the hints give orders.

| Where | Now | Then |
|---|---|---|
| `toast.pickedUp` | You picked up **{item}** | I picked up **{item}** |
| `toast.alreadyHave` | You already have **{item}** | I already have **{item}** |
| `toast.ladderBlocked` | The ladder can't stand there | I can't put the ladder here |
| `toast.ladderDoorway` | Not in a doorway | I can't block a doorway |
| `hint.spray` | Press {use} to spray | I can spray with {use} |
| `hint.opacity` | Hold {sprint} and scroll {prev} / {next} to change opacity | I can hold {sprint} and scroll {prev} / {next} to change opacity |
| `hint.cap` | Press {sizeDown} / {sizeUp} to change the cap | I can change the cap with {sizeDown} / {sizeUp} |
| `hint.ladderShared` | In a session, other players can climb your stepladder too | In a session, others can climb my stepladder too |

The rest of `hint.*` the same way. `status.*`, `dialog.*`, `menu.*` and `toast.screenshot` stay: the game speaks there, not the character.

Open: whether lines that teach a key take "I" too (as above), or stay "Press {use} to spray" and only the rest changes.

## A hint for each new cap

The first time a cap is picked up, one line says what it's for. It shows once, for `infoSeconds`, after the pickup's toast.

| Cap | Line |
|---|---|
| NEEDLE | I can use this cap for small details |
| SKINNY | I can use this cap for thin, clean lines |
| BLUE DOT | I can use this cap for soft fades |
| NY FAT | I can use this cap to fill big letters |
| ASTRO FAT | I can use this cap to cover a wall fast |

BANANA is the starting cap: none.

Work:

- `src/messages.ts`: `hint.capNeedle` and the others.
- `src/tutorial/types.ts`: a fact, `{ type: 'capFound'; cap: CapId }`, told at the pickup, not read from the inventory: a returning player who owns the caps gets no five hints at once.
- `src/tutorial/hints.ts`: one entry per cap, built one way, as `forTool` builds tools'.
- A hint needs the fact as a `show` condition: one more `Cond`, if `pressed`'s pattern doesn't fit.

## The opacity hint

`hint.opacity` exists: after `spray`, with the can, until opacity is set. The owner didn't remember seeing it, so check first that it shows, and that nothing ranked before it holds it back.

## Checks

`npm run check:quick` (`scripts/messages.test.mjs`, `scripts/tutorial.test.mjs`), `scripts/game/hints.mjs` for the strings it quotes, then the release draft.
