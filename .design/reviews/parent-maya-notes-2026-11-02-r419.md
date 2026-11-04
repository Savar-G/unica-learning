# Parent notes from Maya review

Independence: self-review. The parent task will arrange an independent Codex review.

Contract: issue #419, option C from r331, DESIGN.md, and the existing Parent home product styles. Evidence: all 20 PNGs listed in r419/manifest.json, browser-layout.json, browser-access.json, hosted-access.json, migration.json and cleanup.json.

| Dimension | Score | Weight | Evidence |
| --- | ---: | ---: | --- |
| Task fit | 8 | 20 | Each child has one latest note and links to the full history and conversation. Sam has no extra notes section. |
| Content and hierarchy | 8 | 15 | Chat or Call, family-local time, duration, result and question location precede the saved note. The transcript has speaker names and elapsed times. |
| System coherence | 8 | 15 | Existing SupportPage, Geist type, warm palette, corner marker and product link styles. |
| Interaction and states | 8 | 15 | Owner pages, another family's denial, missing session, sibling mismatch, empty history, pagination and data errors have page tests. |
| Accessibility and response to screen size | 8 | 15 | Three viewport sizes have no horizontal overflow. Keyboard focus has a visible outline. Notes links are 44 pixels high. A 60-character name wraps. |
| Visual expression | 8 | 5 | The chosen r331 note card and conversation bubbles fit the existing product. |
| Craft | 8 | 10 | The phone summary stacks. Long text wraps. Names and times remain legible on the transcript. |
| Evidence and fidelity | 7 | 5 | Real authenticated chat pages and hosted access checks. The future Call view uses synthetic metadata. Savar has not approved this implementation's look. |

Weighted score: 79.5/100.

Deterministic checks: the public server-page tests and hosted RLS probe pass. Browser HTTP controls return 200 for the owner and 404 for denied URLs. The two temporary test families and their dependent rows are deleted. No model call, email, live family write or call release change was made.

The normal-name screenshots remain applicable after the title wrapping and name-preservation fixes. Those fixes change long-name wrapping and apply the chat wording before restoring the child's name. The latter has a regression test for a child named Call and preserves quoted transcript text.

The security advisor reports the intentionally authenticated SECURITY DEFINER metadata function. It has an empty search path and explicit auth.uid ownership checks. It returns three safe fields. The hosted probe denies another family, anonymous callers, live sessions and sessions without a note. Parents still cannot read internal call records.

Weakest dimension: evidence for a real family voice call. Calls remain part of #337. The Call screenshots prove the component's display only. Local development HTTP headers do not establish production cache behavior.

Recommendation: needs decision. Savar must approve the look before merge. Independent code review remains open. Keep #419 open until its acceptance criteria are complete.
