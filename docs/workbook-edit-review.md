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
| R428-7 | Both runners: response save failures, lost dispatch and result replies, eight recoveries | Dispatch rows retain spent attempts. Saved writer responses replay. Three storage attempts precede recovery. No batch can dispatch more than five writer requests per page. |
| R428-8 | `scripts/workbook-edit-browser-check.mjs` in Aside | The tag and pin do not overlap. Restoring the old CSS rule makes the same assertion fail. |
| R428-10 | Both runners: a manual edit passes its solve, then the image checkpoint fails | Recovery reuses the saved solve log. The solver receives one call. No batch can dispatch more than five solve requests per question. |
| R428-9 | Position tests and keyboard Enter in Aside | Pointer fractions stay in [0, 1]. The saved keyboard comment has x=0.5 and y=0.5. |

The limit is **5 total writer calls per changed page and 5 total solve calls per question per batch**, including the first call. `EDIT_CALL_LIMIT` states the limit in code. The database enforces it under a batch row lock, with attempt numbers limited to 1 through 5. Worked examples have separate question IDs. Manual field edits make no writer call.

Before dispatch, `reserve_workbook_edit_call` saves the batch, page, question ID, kind, attempt, request hash and lease. The hash includes the build and model frame, base revision, original page, request and logical sequence. A completed result is immutable. Recovery returns that result before checking the budget. A dispatch without a result spends an attempt. A result-save failure retries storage three times with the same result. It never starts a replacement AI call in that execution. If the process loses the result, recovery may spend another attempt. Five spent attempts stop the page, retain its old version and return its comments to pending with a plain reason.

Edit clients use one provider request per ledger dispatch. Transport retries are off. A fallback provider can be selected only on a later dispatch, which spends another attempt. Generation outside edit batches keeps its existing retry behavior. Batches made by old code fail the ledger-version frame check and return to pending.

The public-interface tests cover both runners and both call kinds: repeated result-save failures, a lost dispatch reply, a failure before dispatch commits, a crash after the result commits, and a checkpoint failure after a successful manual solve. The first regression run reproduced the four duplicate-call failures in `/tmp/w428b-red.log`.

`supabase/tests/workbook-edit-call-ledger.sql` verifies both call kinds through hosted RPCs. It checks immutable replay, uncertain attempts, the five-call cap, expired and replaced leases, pending comments, RLS and RPC grants. It deletes the test family inside the rolled-back transaction and verifies that the ledger is empty.
The result banner counts question comments in the latest batch and open layout comments on the current revision. It states how many layout comments are saved and remain open. It states how many question comments were applied or could not be applied, with a plain reason when all failed. A partial failure says, "1 comment couldn't be applied. The rest are done." Earlier question batches do not change the count.

The hosted SQL probe clones a test-family draft. It uses the public RPCs. It rolls back all fixture writes. The browser uses a separate copy of a test-family draft with fake AI on the local development server. The original printed workbook stays locked.

Screenshots are in `/tmp/ui-review/workbook-edit/`:

- `laptop-r428-results-no-overlap.png`: completed batch, separate tag and pin, before/after.
- `laptop-r428b-banner.png`: partly failed batch with the current result banner, captured with Aside account u0 at 1440 pixels.
- `laptop-r428-manual-wrong-number-failed.png`: a manual 999 operand fails, with the previous page retained.

The unit tests prove the independent solve-check refusal with a supplied solver. The browser proves the local UI and code-check refusal with fake AI. These checks do not prove real-model wording quality or hosted rendering.
