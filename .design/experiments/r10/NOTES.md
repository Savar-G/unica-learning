# Supporting text emphasis

Preserve the existing opening layout.
Compare A: bold benefit, B: bold benefit on a new line, C: bold benefit and mechanism.
Recommendation: A. Savar selected C on 2026-10-12.
Use bold text for both the benefit and the mechanism, from "Unica gives your child" to "then mail it home."

The development prototype at http://localhost:3017/?variant=revised shows C.
The production copy remains unchanged.
Open emphasis.html for all three options.

## Verification

- Hero: browser checks at 1440 px and 390 px confirmed the full solution in one strong element with font weight 600. The paragraph fits inside the page. The page has no horizontal overflow. Screenshots: selected-c-desktop.png and selected-c-phone.png.
- Default page: the browser confirmed the original copy with no strong element when the URL has no variant parameter.
- Unit tests: the existing test suite passed. It does not test the text emphasis.
- Static checks: ESLint reported no errors and one existing unused-import warning in src/ds/blocks.tsx. The production build passed, including TypeScript and page generation. These checks do not verify hosted behavior.
- Review: checked the rendered text and the source diff in this session. No independent review was performed.
