# Admin call review, issue 334

The change uses the `/design` direct route. The existing admin pages, styles and board are the references. There is no new visual system.

Review independence: self-review. The implementation agent did this review. The separate code review follows in the parent task.

## Evidence

`manifest.json` lists each screenshot, its width and its hash. All screenshot data is synthetic. `fixture.ts` creates a finished call through the public call module with in-memory stores and the rule model. The voice record uses the same saved trace with synthetic voice version fields. No model, audio, email or database write is needed.

The screenshots use the real AdminFrame, MayaCallList and MayaCall components. The temporary local fixture route was removed after the browser check.

- Laptop: 1440 by 1000. The board and transcript are beside each other.
- Tablet: 834 by 1112. The board is above the transcript, as on the existing page. The calls table scrolls within its border.
- Phone: 390 by 844. The board is above the transcript. List rows show their labels and flag without side scrolling.
- Text and voice replays: the Pause button, a position near 5.8 seconds and visible board paths confirm that the screenshots show playback.
- Keyboard: Home and End on the position control moved to the start and end.
- Disclosure: Technical details starts closed. The open view shows versions and service details.

The first tablet pass found that the selected turn did not scroll into view. The fix uses the turn's position within the transcript, rather than subtracting its position on the page. A DOM test and the repeated browser check cover this case.

## Review result

| Area | Score | Evidence |
| --- | --- | --- |
| Task fit | 8 | Flag priority is applied before the 50-call limit. Each turn can select its board time. |
| Content and order | 8 | Safety labels are beside the call links. Outcome and help stay together. |
| Existing styles | 8 | The admin frame, chips, table, facts, fonts and colours are reused. |
| Controls and states | 8 | Play, pause, seek, speed, finished view, missing board and older records are covered. |
| Access and screen sizes | 8 | Required widths have no page overflow. The focused tests cover reduced motion and access denial. |
| Visual style | 8 | The existing admin style is kept. |
| Detail | 7 | The tablet table needs side scrolling. The board stays first on small screens. |
| Evidence | 8 | Screenshots, public-interface tests and a read-only check of the real admin list and a saved voice call. |

Product weights from the design review rubric give 79/100. No implementation blocker remains in this review. The weakest area is the tablet table density.

Recommendation: Savar must approve the look before merge.

## What the checks prove

- Call list: the reader test applies the actual request filters, order and limit to older flags plus more than 50 newer ordinary calls. A read of the real admin list confirms that the database accepts the queries. No live flag was changed to test priority.
- Replay: DOM tests check text and voice records, their saved times, pause, seek, reduced motion, older trace fallback, child ink and a recorded clear. They do not prove speech timing or a live voice provider.
- Access: API tests refuse reads and writes when the caller has no admin session. The pages keep requireAdmin, and database reads keep the admin session. No policy, parent route or parent reader changed. A separate family's live session was not tested.
- Voice: the existing worker tests and type check pass through the shared call-view change. No worker or provider configuration changed.
- Build: the production build checks types and imports. It does not prove a hosted deployment.

No migration was needed. No database row, alert or email was changed. No live call was started.
