# Round r18: Personalization section and sample report

Brief: Savar's grill session, 2026-10-12. Explore stage only. Savar chooses a variant (D-096) before the build.

Run: `npm run dev`, then open:
- http://localhost:3000/prototype/personalization?v=a (Two columns)
- http://localhost:3000/prototype/personalization?v=b (Switch)
- http://localhost:3000/prototype/personalization?v=c (Report table)
- http://localhost:3000/prototype/personalization?v=d (Fork)
- http://localhost:3000/sample-report

The prototype route answers 404 on production (VERCEL_ENV). It is never indexed. Delete it after the choice.

Pages: every question on Leah's and Kai's pages comes from the real bank (`fillTemplate` with fixed seeds).
The arrays and plates are drawn from the filled values. Kai's third question is a grade 4 template.

Sample report: a scripted Grade 3 BC child goes through the real session, facts section and report model.
Nothing on the report is typed by hand.

Phone height (390 x 844): A 1.85, B 1.30, C 1.37, D 1.44 screens. Desktop (1280 x 900): A 1.92, B 1.63, C 1.77, D 1.25.

Recommendation: D. Known gaps are in `manifest.json`.
