# Round r565 review

Not independent: the author of the mockups scored them against the design rubric (product weights), because this round ran as a sub-agent with no reviewer. Savar's review is the real one. Scores are for option A with the recommended fallback.

| Dimension | Weight | Score | Referent |
|---|---:|---:|---|
| Task fit | 20 | 8 | `a-steady`, `a-got`: no tap per page. The score stays below 9 because no parent has tried it and the live camera is not proven on a phone |
| Content and hierarchy | 15 | 8 | `a-stack`: refused pages come first, with the reason under each. `a-ready`: Please check comes before scores |
| System coherence | 15 | 8 | Tokens and frame from the site. New parts: the camera, the pile, the short child row (an exception to r544) |
| Interaction and states | 15 | 8 | 44 states, including late refusal, blocked camera, limit, paused marking, photo expired |
| Accessibility and responsive | 15 | 6 | No sideways scroll at 390, 768, 1440. Reduced motion passes. Three targets under 44 px; keyboard not tested |
| Visual expression | 5 | 7 | Pen ticks on the page and the green corners give it a point of view. The viewfinder background is a plain drawn surface |
| Craft | 10 | 7 | Consistent spacing and sheets. Thumbnails stay dense at 3 across on a phone; the Day 4 grid leaves one tile alone on its row |
| Evidence and fidelity | 5 | 8 | 83 screenshots from Aside; limits read from the migration; refusal reasons taken from `scan-preview.tsx` and #456 |

Weighted score: 7.6 of 10.

## Checks

- Customer text has no she, her, tutor, Pagewise or provider names, and no em-dash (`rg` over `proto.js`).
- No total score across pages (D-243). Page rows show "8 of 9 right", the words of How it works step 5.
- A retake never changes a finalized mark, as #457 requires. Change this mark is the only way.
- A page with a pending check shows "Please check 1", not a score.
- Notice text is the draft in #457, unchanged.

## Weak spots to test first

1. The real-phone camera test: does a video frame pass calibration, QR reading and handwriting reading? Option A depends on it.
2. Can the parent hold a folded book flat with one hand and keep the phone still with the other? Page curl is untested (G13).
3. Does auto-take fire at the wrong moment while a hand turns the page? The rule "new QR code and still for about a second" needs a real test.
