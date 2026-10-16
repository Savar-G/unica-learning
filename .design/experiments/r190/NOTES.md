# Round r190: the optional extra round (#190, spec #181, D-116)

Savar could not be reached during the build, so the implementer shipped option A of each open look and kept B and C
here as screenshots. Each look is in `manifest.json`. Swap by moving the markup in `src/components/test-extra.tsx`
(ExtraOffer) or `src/components/report.tsx` (ExtraRound, inside ReportAreas).

How the screenshots were made: the real `TakeTest` and `ReportCard` on a temporary harness page (`/dev-r190`, not
committed). Its API ran the real test attempt module on the in-memory store, so no test was stored and no email went
out. The test-screen options B and C were a temporary variants page with the same components and copy; the report
options B and C are DOM moves of the same card on the live page.

The flow screenshots show a round's first question (its own progress, "1 of 8"), the start screen of a round taken
from the report, and its end screen.

Stop part way (after the verifier's finding): `test-round-stop.png` (and `-tablet`) shows "Stop here" on a round
question, `test-round-return.png` the start screen after the child left part way, and `report-round-stopped.png` the end
of a round from the report stopped after 3 answers. Made the same way: a temporary harness page (not committed) ran the
real `TakeTest` with its requests answered in the browser by the real test attempt module on the in-memory store, on
port 3191 with no `.env.local`.
