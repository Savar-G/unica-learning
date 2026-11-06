# Parent Feedback #680

`/account/feedback` accepts feedback from every signed-in parent. No child, workbook, assessment result or dashboard release flag is required. A signed-out visitor returns to the plain page after sign-in. The existing account layout, restored-tab Desk guard and proxy still apply. The page and POST handler also check the Desk cookie. `/api/account/feedback` takes the actor only from the session.

The form has a product dropdown and text. The products are Workbook, Parent dashboard, Marking, Maya (AI Teaching Assistant), and Something else. A `product` query value can preselect a known product. Optional `child` context is checked against the session parent's children in the database. The `from` context is reduced to a known account section. Query strings, fragments and path identifiers are never saved as source context. A same-origin referring page supplies section context when no `from` was supplied.

## Store and limits

The pure public interface is `sendFeedback` in `src/lib/feedback.ts`. `FeedbackStore.submit` is the atomic admission seam. The service adapter calls `submit_feedback`. The in-memory store models its results for local tests.

Migration `20261106_parent_feedback.sql` adds `public.feedback`. Each row holds parent, optional child, request ID, product, text, source section, creation time and team status (`new`, `read`, `closed`). The parent and optional owned child use cascade foreign keys. The existing family and child write-fence triggers apply. Parent deletion admission uses the parent row lock before checking the child and the rate window. This matches family and child deletion admission. No status-edit UI is included.

The database allows at most five new rows per parent in a rolling hour. The function takes database time after the parent lock is acquired. A message has at most 5,000 Unicode characters. The app rejects raw text above that bound before trimming. The database checks stored text length and rejects empty or whitespace-only text. The app rejects null bytes. Text is never truncated.

A parent-scoped request ID records one message and context. The same request with the same normalized text, product, child and source returns `duplicate`, even at the rate limit. Different content under that ID returns `conflict`. The browser retains the ID after an uncertain save. A changed form or a conflict retry gets a new ID. A malformed store response cannot become success. A family or child deletion fence also blocks retries.

Only the service function can insert. The service role has no direct insert/update/delete grant. Parents have SELECT privilege for RLS evaluation but no read policy, so they see zero rows. An admin can read through `is_admin()`. Anon has no table access. Neither parent nor anon can execute the write function. No email or provider alert is sent.

## Admin and local evidence

`/admin/feedback` calls `requireAdmin` before reading through that admin's session. The list orders by creation time and ID descending. A product filter runs in the database. Pages contain 50 messages and use one extra row to decide whether an Older link is needed. React renders saved text, with line breaks preserved, rather than HTML.

Run focused tests with `npx vitest run src/lib/feedback.test.ts src/lib/feedback-store.test.ts src/components/feedback-form.test.ts src/components/admin-feedback.test.ts src/components/account-feedback-link.test.ts src/proxy-feedback.test.ts src/app/api/account/feedback/route.test.ts 'src/app/(product)/account/(dashboard)/feedback/page.test.ts' 'src/app/(product)/admin/feedback/page.test.ts'`.

Run `node supabase/tests/parent_feedback.cjs` for local SQL proof. It creates its own disposable PostgreSQL cluster with Unix socket access only. It loads the actual migration and the existing production family and child fence function bodies. Synthetic base tables and the local `is_admin` seam replace hosted identity and deletion workers. It tests access denial, text limits, retry identity, concurrent rate admission, cascades and ordered two-session deletion races. It stops the cluster on exit. Set `PD680_PG_BIN` if PostgreSQL binaries are elsewhere.

The authenticated Admin dashboard sandbox has a Feedback view with form, saved, empty, too-long, retryable failure and admin-list states. It uses the real components. See `.design/experiments/r680/contract.md`.

The additive migration was applied as `20261106222843_parent_feedback`. Official database type generation includes Feedback and preserves the applied marking evaluation schema. `database.ts` adds the nullable `p_child` argument correction. Final tests, hosted probes, browser evidence and independent review are recorded with the release evidence.
