# Workbook scan progress and reminders

#475 uses accepted immutable scan receipts independently of marking completion. The printed manifest defines each day's required pages. Image expiry, a later recheck or a parent mark change does not erase an accepted scan fact.

## Decisions

The full Day7 required page set admits one durable trigger. Gaps in earlier days do not change that set. The numbered book's confirmed-delivery receipt supplies its separate21local-day backstop. With no accepted pages at that backstop, hold book2 and ask for scans under #628. Do not advance or repeat by plan. Missing delivery remains missing; no date is inferred from shipment, billing or signup.

Four local calendar days without qualifying work form an inactivity episode. The shared family-time helper computes the deadline from the saved delivery/activity context. SQL stores that canonical deadline and owns final time, locking, identity and admission checks. A qualifying scan or genuine pending-item resolution can move the activity anchor. A finalized-item retake cannot manufacture activity.

## Current server release

Both gates default off. Deployment does not change either switch.

- WORKBOOK_SCAN_PROGRESS_ENABLED accepts only `test-only` or `families`. Every other value turns the application gate off.
- WORKBOOK_SCAN_TEST_PARENT_IDS must contain 1 to 20 distinct UUIDs separated by commas. Each listed test parent must retain its test_accounts marker.
- In `families` mode, the application sweep, delivery recovery callback and parent progress endpoint also admit a real family when that child's shared plan gate is open. Missing, closed or unreadable plans are refused. The application checks access again before each write and after the parent read.
- WORKBOOK_SCAN_REMINDERS_ENABLED accepts only `off`, unset or `test-only`. A reminder email requires a listed parent with a current test_accounts marker, including in `families` mode. A real family's inactivity episode can be recorded, but the application does not admit an email for that family.

The Day 7 claim is a database trigger. It runs for every admitted receipt, regardless of the progress environment mode. The progress mode gates application maintenance and reads. Scan admission has its own access rules.

The test-only sweep selects the configured parents before its bound and requires a complete set of at most 5 deliveries. In families mode, each maintenance phase reads the relevant recovery queue in workbook ID order. It pages past closed plans and processes at most 5 admitted books per phase. A book remains in clock recovery until its current delivery calendar is recorded. A due book leaves the queue after a claim or hold. A later cron run processes the remaining books. A failed read or an expired selection stops the turn; neither is treated as zero progress. The delivery recovery callback uses the same access gate and reads only the delivered book's requests. It sends no email.

The existing /api/reminders cron invokes this work after its existing email phases and before55seconds from its start. The maintenance database client has a55-second abort. The dry path invokes no maintenance write. The existing global cron authentication and email-configuration prerequisite remain. Receipts and delivery requests remain durable while scheduled recovery is unavailable. No new cron job or configuration value is installed by this code.

One factory provides the transport for assessment reminders, Maya notices, monthly summaries, card work and scan reminders in that invocation. The queue retains the existing600ms provider-start spacing. Scan dispatch admission runs inside the same queue. One parent message claims the complete current due sibling set. A lost or malformed admission answer starts no provider request and releases nothing. Sent and unknown outcomes have no automatic retry. Explicit refusal alone permits SQL's bounded retry path.

Copies use the existing email copy and deletion guards. Token values are hidden. The message contains no child, workbook, photo, written-answer, score or private-page data. Its link uses the existing protected /account/scan entry. Existing reminder unsubscribe handles scan_inactivity through the ordinary reminders scope, including RFC8058. Unsubscribe changes email eligibility, not scan facts or triggers.

No hosted recipient is approved yet. Keep delivery off until the existing safe test recipient and positive transport/unsubscribe proof are available. Do not send to a real parent overnight. An admitted provider request cannot be recalled.

## Parent projection and UI ownership

The read-only GET /api/account/scans/progress binds its live parent session to child, workbook and printed revision. It returns printed-day required/accepted/gap page numbers, separate marking/review state and confirmed-delivery/backstop state. It never returns raw receipts, photo IDs, audit IDs, answers or cost records. Its canonical server reader can also supply server-rendered views without a self-HTTP request.

The generator owns the follow-up Schedule binding adopted from the dashboard lane. Extend the existing Scanned pages cell/day details, preserving the stored printed Day/Topic/Pages/Required time fields. Keep marking/review and correction links in Workbooks. Add no duplicate Progress tab or poller. Visible changes still require /design and normal UI approval. That UI is not implemented by this backend candidate.

## Proof boundaries

The receipt/clock and reminder-episode migrations have prior local concurrent PostgreSQL proof and independent approval. The reminder schema is hosted as20261107073840; RLS, ACL, empty search paths, preserved email constraints and official types were checked. Positive hosted lifecycle, application-role reads, reminder delivery/unsubscribe and the final combined gate remain separate checks. No customerR2, comment closure, print approval or Mark printed is permitted without the roadmap relay.
