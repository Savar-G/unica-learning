# Round r198: strengths, struggles, words or numbers and the workbook 1 preview (#198, spec #181, D-120)

Savar could not be reached during the build, so the implementer shipped option A and kept B and C here as
screenshots. Each look is in `manifest.json`. Swap by changing `ReportStrengths` and `ReportStruggles` in
`src/components/report.tsx` (the words come from `src/lib/report-view.ts`, which the email uses too).

How the screenshots were made: a temporary harness page and email route (`/dev-r198`, not committed) ran the real
report job on the in-memory adapters with the fake profile AI, then loaded the report through the parent's in-memory
reader, as the account page does. Options B and C were temporary markup on the same page with the same view functions.
The dev server ran on port 3198 with no `.env.local`; nothing was stored, sent or asked of a real AI.

The full evidence set for the ticket (grade 2 and grade 6 reports, the report without AI parts, the emails, the sample
report, tablet and phone) is in the ticket's task-state folder.
