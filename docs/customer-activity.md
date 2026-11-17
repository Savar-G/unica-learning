# Customer activity and progress

Implementation on the MacBook. Hosted setup, official schema types, independent review and browser checks are pending.

Open `/admin/customer-activity` in the Families folder. The family page embeds the same child summaries, filters, book details, history and private contact-note form. The existing Activity page links to the new view. All reads require the live admin session and checked SQL functions. New service writes require an authenticated parent or admin route first.

## Evidence and sources

| Source | What the view can say | Limit |
|---|---|---|
| parents, children | Account creation, child added, family and child identity | A family with no children has history but no child summary |
| assessments, answers, fact_answers, reports | Start, saved answer times, completion, report/email-attempt records, current status and resume deadline | Current state is not a reconstruction of every earlier state; answer text is never copied |
| workbooks, frozen print manifest, workbook_scan_receipts, workbook_scan_progress_events | Current and prior book state, accepted scans, qualifying first scans and admitted evidence progress | Receipt acceptance is separate from effective marking; repeat receipts alone do not renew activity |
| workbook-scan-progress-reader.ts, scan-history-reader.ts | Required printed days/pages, gaps, effective marking readiness, team wait and current technical failure | One selected book at a time; legacy or partial reads say unavailable; no render or inferred paper completion |
| scan_photos | Retained upload events and repeat page-photo counts | Repeat page photos are not necessarily a requested retake; expired/deleted source rows can limit history |
| scan_mark_changes | Manual marks, parent versus team actor and saved admin identity | The page's current effective result comes from the canonical reader |
| maya_calls | Session start/end records, child participation, connected seconds, saved solved/technical outcomes | Missing duration or outcome is unknown; a saved session is not necessarily a connected call or successful lesson |
| feedback | Message receipt and original admin link | No feedback text is copied into the new activity table |
| workbook_delivery_receipts, workbook_delivery_corrections | Confirmed delivery and correction actor/time | Latest matching correction by audit order wins; shipping is not arrival |
| workbook_audit | Retained production/team actions and actor | A current action label is not a reconstructed state transition |
| plan_starts, plan_control_operations | Retained plan attempts and current outcome | Historical actor was not stored and stays unknown |
| customer_activity plan_confirmation | Admin identity that confirmed an already committed successful plan start | New admin start path only; not a claim about who made a historical start; write failure cannot change billing outcome |
| email_log, email_sends, workbook_emails | Retained attempts and current send state | Not evidence of learning or activity; delivery state is not inferred from a send claim |
| customer_activity | Consented page visits, scanner opened, Maya chat/voice attempts, private team notes | No invented backfill or completion events; missing completion does not prove abandonment |

Slack and the product monitor are not read sources. Their delivery is best effort.

## Attention and analytics

- Meaningful work uses first accepted scans per frozen page/revision, accepted retakes admitted by the progress ledger, saved assessment answers/facts and family Maya sessions with child turns. Optional visits, retries, team actions and emails cannot make a child active.
- The child view compares the latest confirmed numbered book's delivery and later meaningful work with four local days. It uses family-time.ts with the stored zone, postal mapping, oldest child province and Pacific fallback, including dated overrides. This is a prompt to check the book, not proof that the child stopped paper work. The summary does not suppress a completed book automatically: open its canonical progress before contacting the family.
- The Awaiting team group uses the retained current print revision and the marking module's pending-item rule. Assessment not completed selects the child's latest in-progress assessment. These filters apply before the child limit. Detailed canonical page state remains the authority.
- Period metrics always exclude every marked test and admin/team family, even when their rows are visible. The test-family switch only changes list rows. Family detail keeps its existing test-family exception.
- Active families are a distinct period numerator over all current retained real families. Historical deletion removes a family from this denominator. Assessment original save times remain evidence even after a later answer. Maya uses the started time of a retained session that has child participation; later individual turn times are not reconstructed.
- Delivery-to-first-scan uses books with effective confirmed delivery in the chosen UTC period. Its median includes only a first accepted scan at or after delivery and before period end. Missing print evidence, missing scans, earlier scans and scans after period end are shown separately. No shipping estimate enters this metric.
- Scanned and fully marked completion are shown for one selected book, with required-day and required-page denominators from the frozen contract. There is no global fully marked book count. A missing history read remains unknown. Marking readiness is the existing completedPage rule, including blank and unscored pages. It is not proof of completed paper work or review by a human.
- Child Maya counts use sessions created within the period and their current retained outcomes. Connected duration has a separate missing-record count. Original session links show the complete retained outcomes.
- Period boundaries and cross-family history use UTC. Child activity and inactivity use the resolved family time. Current state and period evidence have separate labels.

## Optional tracking and private notes

The account layout records a fixed account-page enum. The desk records a fixed desk visit with owned child/book context. The scanner component records entry for the selected owned child. The actual chat start and voice open controls record attempts for the owned child and book. There is no tracking on arbitrary token routes. No action waits for this telemetry.

The existing optional-analytics choice is mirrored to a SameSite=Strict cookie. The client reads the choice before sending and aborts in-flight requests on withdrawal. There is no queue or later replay. The receiving endpoint also requires the granted cookie, explicit same-origin Origin, authenticated parent, JSON content type and strict bounded payload. A missing, denied or revoked choice blocks new writes. Consent is per browser, as for the existing optional analytics.

Payload fields are fixed event/page enums, a random request UUID, and optional owned child/book UUIDs. The endpoint derives the parent, actor and time. It accepts no completion, admin event, URL, query, token, referrer, typed text, name, email, answer, transcript, path, raw error or fingerprint. SQL serializes admission on the parent lock, checks child/book ownership and deletion fences, deduplicates request IDs and each context for one minute, and caps each family at 120 new activity records per rolling hour. Concurrent retries produce one row. Errors never block the product action.

Only the admin note endpoint accepts text, in a separate field with a 2,000-character bound. It derives the actor from the admin session and uses the desk lock and same-origin convention. Notes never enter analytics, Slack, learner profiles or learning evidence. Repeated submission of the same request is idempotent. Notes and committed team plan confirmations remain until linked child/family deletion.

Optional records become invisible after 90 days. The existing authenticated daily keepalive cron removes up to 10,000 expired optional rows per run. A backlog or service failure can delay physical removal. Family, child and book deletion cascade to their linked activity. A coverage row records when storage became available; actual collection starts only after code deployment and consent. An absent visit is not a zero-usage claim. Privacy text and the privacy sitemap date were updated.

## Paging and limits

History uses descending `(at, source-prefixed stable ID)` keysets with a 51-row lookahead for a 50-row page. Time, family, child, book, type, actor, name search and test-family exclusion apply before the limit. Equal timestamps cannot starve the next page. Children use ascending unique child IDs with a 26-row lookahead for 25 summaries. The team/assessment attention and family/child filters apply before this limit. The latest 20 books are shown per child, with a visible bound; earlier retained actions remain in history and original workbook pages.

Each summary page sends three bounded aggregate/history calls. Only an explicitly selected book starts canonical scan reads. These consume UUID-ordered canonical history through an empty tail, rather than the printed-order UI pagination. Reads have request deadlines and independent partial-error states. No polling is added. Links disable prefetch. Totals are not calculated from a truncated browser list.

## Checks and falsifiers

- Admission fails if a non-owner or forged actor can write, an unconsented request is admitted, or concurrent retries make two rows.
- Progress fails if acceptance becomes fully marked, missing history becomes zero, an out-of-scope book is shown, or printed ordering breaks the canonical UUID cursor.
- Metrics fail if visits/notes/retries make a family active, test/team work enters a numerator, or an old period loses original answer evidence after a later response.
- Paging fails if matching rows are limited after an unrelated family, or more than 50 rows with one timestamp cannot all be reached.
- Isolation fails if changing the test order changes a result.

Commands:

```sh
node supabase/tests/customer_activity.mjs
npx vitest run src/lib/customer-activity*.test.ts src/app/api/account/activity/route.test.ts src/lib/admin-nav.test.ts src/lib/scan-track.test.ts src/lib/workbook-scan-progress-reader.test.ts --sequence.shuffle --sequence.seed=171119
npx eslint src
npm run typecheck
npm run build
```

The SQL runner creates and removes its own temporary local PostgreSQL cluster. It uses synthetic required-column tables and stub deletion-fence triggers. It proves SQL admission, grants, append-only behavior, rate limiting, concurrent deduplication, actor checks, timestamp ties, filter-before-limit, test/team metric exclusions, retained-period evidence, unknown duration, optional retention and child cascade. It does not prove the full hosted schema, real deletion-fence triggers or hosted RLS.

The broader shuffled product checks found a shared reply fixture in desk-voice.test.ts. That test passed alone. The fixture now resets its reply and browser storage before each test. No voice behavior was changed to fix that test.

Build compilation passed. Type checking stops because the official generated schema does not yet include the new functions. Existing generated files were not edited. The parent must run the official generation and final full gate before publication. No live browser, paid AI generation, hosted migration, vault write, push or PR was performed by this worker.

## Recorded verification (2026-11-16)

- Local SQL probe: passed against a fresh temporary PostgreSQL cluster. It includes family/child cascades and a team-attention match after more than 25 unrelated children.
- Focused product and activity tests: 267 passed across 17 files, shuffled with seed 171123. This includes scan UI, desk chat/voice, consent, admin test-family pages, plan-start route checks, canonical progress and the new server/UI tests.
- `npx eslint src`: passed.
- `npm run typecheck`: route generation passed; eight errors remain at the new RPC calls and their checked NullArgs entries because the generated schema predates the migration. No other source type error was reported.
- `npm run build`: optimized compilation passed; TypeScript stopped at the missing RPC schema and related inferred-type errors. The existing ai-usage.ts dynamic-file tracing warning also appeared.
- The existing results-call test printed a blocked iframe-loading diagnostic from happy-dom and still passed. No live browser was used.
- The final full test suite, official database checks/types, hosted permissions and rendered browser states remain for the parent.

## Parent setup

CUSTOMER_ACTIVITY_HOSTED_SETUP_PENDING

Migration: `supabase/migrations/20261117040357_customer_activity.sql`.

1. Check the hosted migration registry and current dependencies. Verify that this timestamp is unique. Follow supabase/migrations/README.md. Apply this additive file before deploying its readers/writers.
2. Run `npm run db:types`. Run `npm run db:checks`. Commit both generated files. Do not use query type overrides. The new nullable function arguments are already declared in src/lib/database.ts. The state-list test registers the activity event and page enums and needs the fresh check snapshot.
3. Run the read-only transaction in `supabase/tests/customer_activity_hosted.sql`. It ends with ROLLBACK and makes no product or telemetry writes. Confirm RLS, private table/view grants, service-only writer/purge functions, authenticated admin reader execution, and non-admin refusal. Function search paths are empty and default PUBLIC execute is revoked.
4. Complete isolated hosted ownership/deletion/consent checks and an authenticated admin read. The read-only probe does not replace these checks. Never use a real customer's activity as a write fixture.
5. Run the final `npm test && npx eslint src && npm run build`. Run voice/text checks for the touched desk paths. Use the approved local browser with npm run dev for empty, partial error, real family, test switch, page/child/book filters, equal-time paging, consent rejection/revocation, scanner/Maya attempts, private-note retry, narrow-screen table overflow and keyboard navigation. Close any admin tab after its check.
6. Review and publish through the parent workflow. To stop tracking without removing data, roll back the application change. The SQL is additive; do not drop history or rewrite applied migrations as a rollback.

## Remaining limits

No global marked-book completion or four-local-day inactivity cohort is materialized. The selected book provides canonical completion; child rows give a check-first inactivity reason. The overview has explicit current awaiting-team and unfinished-assessment groups. Historical plan actors, individual historical Maya turn times, vanished source rows and pre-consent workflow attempts cannot be reconstructed. The book list currently shows 20 prior/current records per child. Browser and independent review are still required.
