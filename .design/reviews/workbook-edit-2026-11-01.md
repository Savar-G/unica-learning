# Workbook comment review

Route: design direct. Surface: product. Constraint: existing admin system.
Independence: self-review. No other agent performed this review.

The approved task defines the interaction: page images, measured question locations, saved comment drafts, a comment panel, exact fields within a comment, and one Send all comments button. The existing admin buttons, type, colours and spacing remain the visual rules.

## Evidence

Aside on the development server, with the fake writer and solve checker, at widths 1440, 1024 and 390 pixels. Screenshots are in `/tmp/ui-review/workbook-edit/`.

- `laptop-reviewer-pins.png`: saved question comments and their pins.
- `laptop-exact-fields.png`: the exact-field form and calculated answer.
- `laptop-working-status.png`: a server batch in progress.
- `laptop-mac-waiting.png`, `tablet-working.png`, `phone-working.png`: the Mac queue.
- `laptop-results-history-final.png`, `tablet-results-history-final.png`, `phone-results-history-final.png`: results and before/after.
- `laptop-history.png`, `tablet-history.png`, `phone-history.png`: batch history.
- `laptop-locked-printed.png`, `tablet-locked-printed.png`, `phone-locked-printed.png`: the printed lock.

Enter saved a comment. Esc cancelled an unsaved page comment. Saved comments remained after a reload. The exact-field form calculated the answer. A failed page kept its old content. After correction, the batch completed and approval reset to draft. A second batch went through the Mac queue with fake AI and redid one page. The test-family workbook Ava reached version 3 and was then approved and marked printed to check the lock.

The first tablet capture exposed an unbounded grid row. A fixed review window now gives each column its own scroll area. A reload exposed different server and browser timezone rules. The server now supplies the history text to prevent that hydration error.

## Review

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Task fit | 8 | Pins, the question list and one batch button support review without leaving the draft. |
| Content and hierarchy | 8 | The side panel keeps pending notes and results beside the page. |
| System coherence | 8 | Controls use the existing admin styles and tokens. |
| Interaction and states | 8 | Saved, waiting, working, failed, done and locked states were exercised. |
| Accessibility and responsiveness | 7 | Named buttons, visible focus, Enter and Esc, and three viewport widths. No screen-reader audit. |
| Visual expression | 7 | A restrained document reviewer within the existing admin system. |
| Craft | 7 | Measured question regions and independent scroll areas. Exact fields can require substantial scrolling. |
| Evidence and fidelity | 8 | Public-interface tests, hosted probes and real browser interactions. AI output used fakes only. |

Weighted product score: 7.7 of 10. Recommendation: ready for Savar's review. No independent visual review was performed. The assembled print file is an image PDF. A failure on a page keeps all submitted comments for that page available for another attempt.
