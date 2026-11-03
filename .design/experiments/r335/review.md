# Admin workbook question review

Design route: direct. Existing admin components and design tokens.
Review independence: self-review. A separate Codex review follows the implementation.
Recommendation: needs decision. Savar must approve the look and Maya's new lines before merge.

Evidence: the 13 screenshots and their hashes in manifest.json. The screen uses a synthetic printed workbook with saved question boxes. The call uses the public session module with the fake model. No live family row changed.

| Area | Score | Evidence |
| --- | --- | --- |
| Task fit | 8 | Tap and exact reference entry select page 4, question 3. The selected card has text and voice start controls. |
| Content and hierarchy | 8 | The selected reference and question appear together. Voice setup has a plain unavailable label. |
| System coherence | 8 | Existing admin frame, page image, form, buttons and call view. |
| Interaction and states | 7 | Selection clears on a changed reference. Busy controls are disabled. Missing and malformed references produce different code-written messages. |
| Access and screen size | 8 | No horizontal overflow at 1440, 834 or 390 pixels. The reference input has a 44-pixel height. Tab reaches Find question with a visible outline. |
| Visual expression | 7 | Plain admin layout. The selected question box has a border and pressed state. |
| Craft | 8 | The reference input now matches the page select. The phone puts the selected card below the page. |
| Evidence and fidelity | 7 | Production components with local synthetic data. Real microphone and physical-device checks remain open. |

Weighted score, product weights: 7.75/10. The remaining limit is the real speech path. The screenshots prove browser layout at those widths. They do not prove a physical tablet or phone.

The browser uses a temporary local fixture route. It calls the same resolver as the admin endpoint. The production admin endpoint has separate server access tests. The fixture does not prove hosted access rules. All temporary routes and API URL substitutions were removed.

The reference grammar accepts `page N, number M` and `page N number M`. An optional final period is allowed. Case and outer space do not matter. N and M are integers from 1 to 1000, or the words one through twenty. Extra words, competing references and unsupported forms ask again. No model interprets a reference.

New Maya strings, for approval:

- `Hi, I'm Maya, an AI helper. Let's do page {page}, number {number}: {expr}.`
- `Say or type "page 4, number 3". Which question do you want?`
- `I can't use that question. Choose a printed page from this child's workbook.`

The operation supplies `{expr}`. The opening never reads arbitrary workbook prose. The controller owns the opening. Page and question numbers are reference data. They do not count as a child answer.

Subsystem proof boundaries:

- Selection: public tests prove exact parsing, ownership, print status, page and question existence, package validity and matching package identity. They use an in-memory workbook store.
- Text: public tests complete a scripted call, save its reference and resume between turns. The profile rebuild receives the facts-only option.
- API: route tests deny signed-out and parent sessions before content access. They reject a foreign origin and recheck print status at start. They do not test a hosted family session.
- Voice: fake audio, speech and board transport preserve the selected package and say the confirmation before teaching. The route mints the room ticket from the same server selection. No real room, speech provider or microphone was used.
- Browser: screenshots show tap selection, typed reference, confirmation and refusal at all three widths. They do not exercise hosted persistence.

Part of #335. The reference microphone is wired through a separate 30-second LiveKit connection. It uses the configured STT before a teaching call exists. Scoped token and fake-room tests cover the complete transcript path. Real microphone collection, real provider output, Chrome and Safari on an iPad, interruption and reconnect with a real room remain unverified. Provider accounts are not available. The page offers tap and typed selection now. Say page and number and Start voice call become available when voice is configured. Both use the same resolver. Deploy the matching voice worker with the site before a real call.

Final checks: `npm test -- --maxWorkers=2` passed (279 files, 12,635 tests). The additional mounted microphone tests passed (1 file, 2 tests). `npx eslint src`, `npm run build`, `npx tsc --noEmit`, `npm run voice:typecheck` and `npm run voice:build` passed. `npm run voice:test` passed (7 files, 59 tests). Every command exited 0.
