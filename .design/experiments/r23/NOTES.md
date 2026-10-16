# Round r23: the learning card with three new questions (#195)

Brief: spec #181 and ticket #195. Extend the "Tell us how {child} learns" card (D-100) with "How does {child} feel about
math?", "What is your main goal?" and "How much time each week?", the free-text label "What does {child} find hard in
math?" and the hint "If {child} is nearby, answer these together." Unattended run: the agent built three options and
shipped B. Savar can swap.

Options (screenshots in this folder, Next step row of the real sample report):
- A, One list: the new questions in reading order, the hint under the lead.
- B, Two groups (shipped): "About {child}" with the hint, then "Your goal and time".
- C, Compact rows: the three one-answer questions as rows at the top.

Card height (desktop 1280 x 900 / phone 390 x 844): A 1.02 / 1.54 screens, B 1.14 / 1.66, C 0.93 / 1.51.

The prototype route (`src/app/(site)/prototype/learning-card/page.tsx`) was deleted before the commit. Its source is
`prototype-route.tsx.txt`: copy it back to that path and run `npm run dev` to see A and C again.

Choices for the weekly time (D-107): Under 1 hour, 1 to 2 hours, 2 to 3 hours, More than 3 hours. A book plans 15-30
minutes a day, 5 days a week (DESIGN.md), which is about 1 to 2.5 hours.

Recommendation and choice: B. Known gaps and reasons are in `manifest.json`.
