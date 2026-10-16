# Round r189: honest results (#189, spec #181)

Savar was asleep (build-spec run of 2026-10-15), so the implementer shipped option A of each open look and kept
B and C here as screenshots. Each look is in `manifest.json`. Swap by moving the markup in `src/components/test.tsx`
(TakeYourTime) or `src/components/report.tsx` (Certainty, ReportContext).

How the screenshots were made: the real `TakeTest` and `ReportCard` on a temporary page (not committed). The test API
was answered inside the browser driver, so no test was stored and no email went out. B and C are small DOM moves on
the same live page.
