# Opening section prototype

Question: Which structure makes the problem, child benefit, and mechanism easiest to read?

Run: `npm run dev -- --port 3017`.
Open: http://localhost:3017/?variant=A
Use the floating arrows or keyboard arrows to select A, B, or C.
The original opening appears without the variant parameter.
Production builds use the original opening.
The sample assessment button in the prototype does not submit data.
The rest of the existing page retains its normal links.

Open hero-prototype.html for a self-contained comparison with desktop and phone controls.
A.png, B.png, and C.png show the comparison at desktop width.

Recommendation: A for the clearest reading order.
Selection: Pending user review.
After selection, replace the prototype with the chosen production implementation and remove the switcher.

Validation:
- Existing tests pass. They exercise existing product logic, not visual preference.
- ESLint completes with one existing unused-import warning in src/ds/blocks.tsx.
- Production build passes, including TypeScript and static generation.
- All options fit 1440px and 390px widths without horizontal overflow.
- Browser arrows cycle through the options and update the URL.
- Standalone comparison renders each option without console errors.
- Visual review was performed by the implementing agent.
