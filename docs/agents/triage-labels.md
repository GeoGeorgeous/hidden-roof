# Triage Labels

The skills speak in terms of five canonical triage roles. This repo has no labels: the roles map to the `status` line of an item in `docs/backlog.md` (see `issue-tracker.md`). Category roles map to `type`.

| Role in mattpocock/skills | In `docs/backlog.md`                                   | Meaning                                  |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `needs-triage`            | `status: Requested`                                    | Maintainer needs to evaluate this item   |
| `needs-info`              | `status: Requested` + a `Triage notes` line of questions | Waiting on the owner for more information |
| `ready-for-agent`         | `status: Planned` (has a "Do:" and a size)             | Fully specified, ready for an AFK agent  |
| `ready-for-human`         | `status: Planned` + "needs a human:" and the reason    | Requires human implementation            |
| `wontfix`                 | delete the item                                        | Will not be actioned                     |

| Category role | `type`                                       |
| ------------- | -------------------------------------------- |
| `bug`         | `bug`                                        |
| `enhancement` | `feature`, `idea`, `perf`, `chore`, `refactor` |

`Blocked` is not a triage role: an item with an unfinished `blocked-by` is `Blocked` until its blockers are done.
