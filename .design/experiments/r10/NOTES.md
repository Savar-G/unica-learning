# Supporting text emphasis

Preserve the existing opening layout.
Compare A: bold benefit, B: bold benefit on a new line, C: bold benefit and mechanism.
Original recommendation: A. Savar first selected C on 2026-10-12, then rejected the bold text.
Final selection: normal paragraph weight for both the benefit and the mechanism.

The normal home page now uses the revised copy. The development variant switch was removed.
Savar authorized the merge to main. See D-094 in .design/decisions.md.
Open emphasis.html for the three earlier options.

## Previous verification of C

- Hero: browser checks at 1440 px and 390 px confirmed the full solution in one strong element with font weight 600. The paragraph fits inside the page. The page has no horizontal overflow. Screenshots: selected-c-desktop.png and selected-c-phone.png.
- Default page: the browser confirmed the original copy with no strong element when the URL has no variant parameter.
- Unit tests: the existing test suite passed. It does not test the text emphasis.
- Static checks: ESLint reported no errors and one existing unused-import warning in src/ds/blocks.tsx. The production build passed, including TypeScript and page generation. These checks do not verify hosted behavior.
- Review: checked the rendered text and the source diff in this session. No independent review was performed.

## Final verification without bold text

- Hero: Playwright checked the normal home page at 1440 px and 390 px. Both checks confirmed the revised copy, normal font weight 400, no bold element, and no horizontal overflow. Screenshots: plain-desktop.png and plain-phone.png. The visual review confirmed that the paragraph fits at both widths.
- Production build: the generated home page HTML contains the revised solution with no bold element. This check does not prove that the hosted deployment has finished.
- Unit tests: the existing test suite passed. It does not test the text emphasis.
- Static checks: ESLint reported no errors and one existing unused-import warning in src/ds/blocks.tsx. The production build passed, including TypeScript and page generation.
- Source review: compared the code with origin/main. The application change is limited to the hero lead. The development variant switch was removed. No independent review was performed.
