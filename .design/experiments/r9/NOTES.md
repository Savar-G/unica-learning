# Opening section copy prototype

Savar rejected A, B, and C on 2026-10-12.
Keep the existing layout shown in his reference screenshot.
Keep the headline, rotating topic, buttons beside the paragraph, and price line.
Revise only the supporting copy. The revised copy is pending review.

Run: `npm run dev -- --port 3017`.
Open: http://localhost:3017/?variant=revised
All earlier variant URLs now show the same revision.
Without a variant parameter, the original copy appears.
Production builds keep the original copy.

Validation:
- Existing tests pass; they cover product logic, not the copy.
- ESLint passes with one existing unused-import warning.
- Production build passes, including TypeScript.
- Desktop buttons remain beside the supporting paragraph.
- The phone layout has no horizontal overflow.
- revised.png shows the current copy in the existing layout.

Remove the prototype after the copy is selected.
