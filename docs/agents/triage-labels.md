# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual labels and workflow states used in our Linear workspace (`unica-learning`, team `UNI`).

| Label in mattpocock/skills | Label in Linear (`UNI`) | Workflow state pairing | Meaning                                  |
| -------------------------- | ----------------------- | ---------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`          | `Triage`               | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`            | `Triage` / `Backlog`   | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`       | `Todo`                 | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`       | `Todo`                 | Requires human decision or work          |
| `wontfix`                  | `wontfix`               | `Canceled`             | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), apply the matching Linear label from this table and keep the issue's workflow state aligned (`Triage`, `Backlog`, `Todo`, `In Progress`, `In Review`, `Done`, or `Canceled`).

Additional workspace labels:
- **`Area` label group (required, mutually exclusive):** `Maya (AI Tutor)`, `AI Marking & Scanning`, `Workbook Generator`, `Parent Dashboard & Platform`, `Website & Growth`, `Assessment & Report` — routes each issue to its pinned product Kanban board.
- **Scope / release labels:** `mvp`, `after-mvp`, `spec`, `Bug`, `Feature`, `Improvement`, `accessibility`, `documentation`.
