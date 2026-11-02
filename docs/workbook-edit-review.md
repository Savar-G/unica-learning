# Workbook edit corrections for PR 428

The approved comment pins, pending list, Send all comments, before/after view and printed lock stay in place.

| Finding | Regression check | What it proves |
| --- | --- | --- |
| R428-1 | `workbook-edit.test.ts` manual 8 plus 2 data with subtraction wording | An independent answer of 6 refuses the code key of 10. Manual text keeps its human marker and always enters the solve check. |
| R428-2 | Both runners, transient checkpoint errors and an expired lease | The same batch can resume. A replaced or expired holder cannot checkpoint or finish. The UI offers Try again after expiry. |
| R428-3 | Prompt capture and a changed sequence | The writer sees current words and data. A wording-only edit retains numeric data. |
| R428-4 | Memory save retry and `supabase/tests/workbook-edit-recovery.sql` | One client request key returns one comment ID, including after a revision change. |
| R428-5 | Resume with a changed build, writer model or solve model | The batch fails and returns its comments to pending. Unframed legacy partial results also fail. |
| R428-6 | `admin-workbook-lists.test.ts` | The workbook and child lists use the latest counts and render problems. |
| R428-7 | Checkpoint failure after a completed response, on both runners | A resume reads the stored writer response without another writer request. |
| R428-8 | `scripts/workbook-edit-browser-check.mjs` in Aside | The tag and pin do not overlap. Restoring the old CSS rule makes the same assertion fail. |
| R428-9 | Position tests and keyboard Enter in Aside | Pointer fractions stay in [0, 1]. The saved keyboard comment has x=0.5 and y=0.5. |

The writer uses one request per changed page, plus at most 5 retries on failure across the helper and providers. This bound includes at most 2 helper calls. Each can try the subscription once and the API twice, including its transport retry. Manual field edits use no writer request. Completed responses are stored before code checks, solve checks and rendering.

The hosted SQL probe clones a test-family draft. It uses the public RPCs. It rolls back all fixture writes. The browser uses a separate copy of a test-family draft with fake AI on the local development server. The original printed workbook stays locked.

Screenshots are in `/tmp/ui-review/workbook-edit/`:

- `laptop-r428-results-no-overlap.png`: completed batch, separate tag and pin, before/after.
- `laptop-r428-manual-wrong-number-failed.png`: a manual 999 operand fails, with the previous page retained.

The unit tests prove the independent solve-check refusal with a supplied solver. The browser proves the local UI and code-check refusal with fake AI. These checks do not prove real-model wording quality or hosted rendering.
