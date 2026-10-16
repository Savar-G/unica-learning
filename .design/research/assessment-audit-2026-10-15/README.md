# Assessment audit, 2026-10-15

Inputs for the spec "Accurate BC math diagnosis" (GitHub issue linked from the PR that added this folder).

| File | What it holds |
|---|---|
| `code-audit.md` | Read-only audit of the online assessment as of `main` at e0b25ef: flow, item bank, selection and scoring, data captured, parent report, admin, retention, decisions, gaps. Line numbers refer to that commit. |
| `bank.csv` | One row per question template (527): bands, strands, province levels, answer type, BC standard code, sample prompt, misconception tags. |
| `bc-math-standards.csv`, `bc-math-standards.md` | The 106 BC Mathematics content standards for grades 1-7, exact text, with elaboration scope, from curriculum.gov.bc.ca (checked 2026-10-15; no revised curriculum in effect). Codes `BC-G<grade>-<n>` follow the page order, so `BC-G4-05` is the bank's standard `4.5`. |
| `bc-math-big-ideas.csv` | The Big Ideas for grades 1-7. |
| `research.md` | Diagnostic test science: items per skill, test length and fatigue, response time, learning preferences, misconception catalogue, report contents, parent perception of length. Each claim is tagged V (verified), S (secondary), C (calculation), K (background), U (unverified). |
| `live-data.md` | Production data on 2026-10-15: 1 test, taken by an admin; no real-family tests yet. |

Cross-check (2026-10-15): every BC code in the bank is a real BC standard. Standards with no question: 2.2 (benchmarks of 25, 50 and 100) and 4.17 (probability experiments); 3.4, 4.7, 4.8 and 5.8 are fact-fluency standards that the timed facts section covers.
