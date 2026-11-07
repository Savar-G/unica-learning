# Chat-only parent presentation

Date: 2026-11-06. Decision: D-293. Required base: `d4af3d62d5fba25ba3b39441d9cc719b2bf06604`.

Use `/design direct`. Job: fix. Surface: product and component. Constraint: existing system.
This change implements the specified first-shipment parent presentation. It does not approve family release.
D-236 and D-249 still require the complete review page and Savar's approval.

## Presentation contract

- Keep the parent frame, white Overview cards, semantic tokens, type and link styles.
- Show a Maya card in Overview only when the child's existing tabs include Maya.
- Link that card to `/account/notes/<child>`. Describe saved notes and transcripts.
- Show no voice allowance, weekly reset, parent call demo limit or call launcher.
- Show no new chat count or access claim in Overview.
- Keep the existing gated chat usage on home fallback and the Maya tab. Label it Maya chat today.
- Show no usage card when the existing chat reader returns no usage.
- Keep the existing daily message cap, reset text and spending status. Add no quota.
- Keep the Maya tab, parent notice, saved notes, transcript links, pagination and empty states.
- Keep historical Call and Chat labels and actual session durations.
- Keep the existing release, plan, grade and notice checks. A notes link starts no session.
- Keep the static Admin preview inert. It must make no service, provider or analytics call.
- Keep the voice ledger and every caller outside these parent UI reads unchanged.

## Inspected references

- `DESIGN.md` and `.design/decisions.md`, D-293, D-236 and D-249.
- `src/components/parent-overview.css`: white cards, existing labels and 44 px links.
- `src/components/parent-home-rows.tsx`: existing home row and notice card.
- `src/components/parent-maya-notes.tsx`: channel labels, duration and transcript links.
- `.design/experiments/r553/overview-desktop.png` and `maya-tab-phone.png`.
- `.design/experiments/r419/parent-home-laptop.png`.

These existing images show the prior product. They do not prove the new rendering.

## State matrix

| State | Required result | Local evidence |
| --- | --- | --- |
| Active child, Maya tab | Overview links to this child's notes without a voice allowance | Account route tests and static Admin tests |
| Chat release closed | Notes remain readable; no usage card when the reader returns no usage | Notes route tests, Admin closed state and fake access tests |
| New result pending | Keep the preparation message and eligible notes link | Account route tests |
| First book pending, no workbook | Keep the existing tabs; add no Maya card without the Maya tab | Account route tests and Admin first-book states |
| Plan ended | Keep saved notes and transcripts; no new launcher | Account and notes route tests, Admin ended state and fake plan checks |
| Grade below 3 | Preserve the existing refusal of chat; saved notes remain readable | Fake chat gate tests and notes presentation with no usage |
| No notes, chat unavailable | Keep the empty-state sentence; no empty usage card | Notes route tests |
| No notes, chat available | Keep existing usage and daily-cap/reset text above the empty state | Notes route tests and Admin empty/used states |
| Home fallback, no Maya tab | Keep gated chat usage and latest note; remove voice allowance and demo limit | Account route tests |
| Multiple children | Use only the selected child's Overview and notes; home fallback keeps each row's own data | Account/notes tests and Admin first/second child tests |
| Historical call and chat | Keep both channel labels, durations and transcript destinations | Notes route tests and Admin session/chat states |
| Notice due | Keep the existing notice link and server refusal before agreement | Account notice tests and fake notice tests |
| Admin desktop and phone states | No voice allowance or launcher; all links and controls remain inert | Static DOM tests for every Overview/Maya scenario |

The fake gate tests exercise the existing release, plan, grade and notice code. The UI tests supply the reader's result.
They do not prove hosted access or provider behavior.

## Verification and handoff

The source-before control uses populated voice usage on the required base. An allowance or unusable launcher disproves the correction.
The source-after tests also require the saved-note destination and existing chat text, so removal alone cannot pass.

Run only the focused fake tests, source ESLint and TypeScript in this worktree.
Generate Next route types with `next typegen`; do not build or start the browser.
Root owns integration with reduced565, rendered desktop/phone evidence, the full gate, independent review and release.
No new rendered evidence or visual approval is claimed here.
