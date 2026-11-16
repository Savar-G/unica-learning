# Product monitoring

Status: repository implementation, 2026-11-16. Base: `45222b0be65b5fefe9583ede6854beeb8a285892`.
This document does not confirm a deployment or a live Slack or Sentry check.
The parent task owns service configuration, independent review, and release.

## Data and delivery

`src/lib/product-monitoring.ts` accepts fixed event codes. It removes unknown keys and values.
Only `photoId` and `callId` UUIDs, bounded whole-number counts, and the enums in that file can pass.
No exception object, message, name, email, child words, question, answer, photo, prompt, token, or full request can pass.

The Node server registers `productObserver` in `src/instrumentation.ts`.
Success and expected waiting states use Sentry structured info logs with `product_event` attributes.
Unexpected failures use Sentry issue messages with fixed codes and stable fingerprints.
The issue handler uses new Sentry scopes and a final event allowlist. It removes the current request's user, contexts, and breadcrumbs even if the runtime retains its isolation scope.
The existing Sentry collection switches and scrubbers still apply. Consent and replay rules do not change.

Slack receives a code, counts, and an authenticated admin link. Link previews are disabled.
It receives no UUID except inside a protected call link. Scan and feedback links open the existing admin lists.
Slack delivery uses Next `after`. The customer response does not wait for the network.
The two-second limit aborts the request and releases the callback even if a transport ignores the abort.
Redirects are refused. Only HTTPS `hooks.slack.com/services/` webhooks are accepted.
Tracing is suppressed around the webhook request. The Sentry scrubber also removes Slack webhook paths.

A delivery, registration, or configuration failure creates a fixed `monitoring.*_failed` Sentry issue.
It does not send another Slack alert. No raw provider reply or error text enters that issue.
The product result stays unchanged if the observer, scheduler, or transport fails.

## Event matrix

All failures in this table create Sentry issues and can send a Slack alert.
Other events create info logs. Only `scan.marking_deferred` has no Slack alert.

| Code | Committed boundary or handled failure | Repetition rule |
| --- | --- | --- |
| `scan.upload_committed` | The upload holder receives committed `pending` from finish or the unfinished-photo swap. A second spread page can also reach this point after reconciliation. | An already stored PUT retry returns before emission. A read emits nothing. |
| `scan.upload_failed` | Upload admission, storage, finish, or unexpected upload processing failure. An uncertain result is a failure to confirm, not proof that bytes were lost. | Each failed attempt can emit. Bad images, invalid QR codes, duplicate pages, and ordinary refusals do not create issues. |
| `scan.send_accepted` | `send_scan_photos` or `send_due_scan_photos` returns newly sent rows for one child. | Only the returned new rows count. An empty retry result emits nothing. |
| `scan.send_failed` | A Send write fails, including a partial family Send, or the route catches a failed read. | Each failed attempt can emit. |
| `scan.check_failed` | Background crop or photo-check work throws, or task registration fails. | A refused photo check is an expected result, not an exception. |
| `scan.marking_complete` | The marking lease holder commits finish. The canonical effective page view reports complete. | Finished-job claims cannot reach finish again. Reads emit nothing. |
| `scan.marking_team_pending` | The same committed finish has pending answers or team checks. | This is not a page-complete notification. |
| `scan.marking_deferred` | The marking operation pauses for an expected admission or confirmed rate-limit outcome. | Info only. Budget, switch, and price outcomes do not create failure issues. |
| `scan.marking_failed` | A provider or extraction failure becomes pending, a second look fails unexpectedly, or Send's per-photo work throws. | A later attempt can emit again. A failed second look can coexist with a completed first read. |
| `scan.recovery_failed` | A due-send read or deferral fails, the recovery loop catches a per-photo or profile failure, or marking background work cannot run. | Recovery can report the same unresolved failure on a later run. |
| `maya.started` | The revision write first stores a non-null session start time. A voice ticket alone is not a conversation start. | Compare the old record with the committed change. |
| `maya.ended` | The revision write moves a live call to ended, except a technical-issue outcome after a session started. A ticket cancelled before Maya joins is an expected end. | Later note, event, profile, and end retries do not repeat the lifecycle event. |
| `maya.safety_flagged` | A revision write commits a higher safety flag. | Once for each committed rise. The existing safety email remains separate. |
| `maya.failed` | A model request fails unexpectedly, a call ends with a technical-issue outcome, or chat/voice request work fails. Stream failure after the first sentence is included. | Several distinct failures within a call can emit. Spend refusals do not become model failures. |
| `maya.recovery_failed` | A caught safety read, history, learning-event, note, or voice persistence failure, or stream lifetime registration failure. | A later recovery attempt can emit again. |
| `feedback.received` | `submit_feedback` returns `saved`. | An exact retry returns `duplicate` and emits nothing. Feedback text stays in the protected table. |
| `feedback.failed` | The feedback store throws or returns an invalid admission result. | Validation, rate limits, conflicts, and family deletion refusals are expected. |
| `dashboard.request_failed` | The scan stack fails, its optional book or marks read fails, or handled chat-access/usage reads fail. | Each failed read can emit. Existing Sentry still handles browser navigation and render exceptions. |

## Configuration and verification

1. Keep the existing Sentry configuration in [sentry.md](sentry.md).
2. Set the server-only `SLACK_PRODUCT_ALERTS_WEBHOOK_URL` in Vercel Production to the webhook for `#unica-product-alerts`.
3. Do not put the secret in a `NEXT_PUBLIC_` variable, source file, command output, issue, or PR.
4. Verify that the running deployment has `VERCEL_ENV=production`. `NODE_ENV=production` alone does not permit Slack delivery.
5. Verify Sentry issue routing and structured log availability. Sentry must be enabled for its events to arrive. Slack is independent of the DSN switch.
6. After an authorized deployment, use an authorized test family. Upload one page, send it, and wait for its stored marking result.
7. Check the event sequence against the protected records. Confirm that a team-pending page did not produce `scan.marking_complete`.
8. Reload and retry the same actions. Confirm that no new success alert appears without a new committed transition.
9. Start and end a test chat. Check its protected admin record. Confirm that Slack and Sentry contain no transcript or child name.
10. Submit one test feedback message. Retry its request ID. Confirm one receipt alert.
11. Confirm that preview actions produce no Slack requests. Use a fake transport for timeout and refusal checks. Do not damage live credentials to test an error.
12. Remove the webhook variable to disable Slack alerts. Sentry events remain enabled by the existing Sentry settings.

Local verification commands:

```sh
npx vitest run src/lib/product-monitoring*.test.ts src/lib/maya-call*.test.ts src/lib/maya-chat*.test.ts src/lib/maya-text*.test.ts src/lib/scan-send*.test.ts src/lib/scan-marking*.test.ts src/lib/scan-stack-server.test.ts src/lib/feedback-store.test.ts src/lib/sentry-scrub.test.ts 'src/app/api/account/scans/[id]/route.test.ts' src/app/api/account/scans/route.test.ts src/app/api/account/scans/send/route.test.ts src/app/api/desk/chat/route.test.ts src/app/api/desk/voice/route.test.ts --sequence.shuffle --sequence.seed=1613
npm run voice:test
npm run voice:build
npm test
npx eslint src
npm run build
```

The focused tests verify privacy, the production gate, timeout, refusal, scheduler failure, recovery, and event wiring.
Fake stores and transports do not prove hosted database behavior or provider delivery.
The full gate verifies repository compatibility. It does not prove a customer session.

## Known limits

- This is best-effort operational notification, with no durable outbox or migration. A crash after a product commit and before emission can lose the alert. A timeout can mean Slack accepted the message but the response was lost. The code does not retry Slack. The protected product records remain authoritative.
- The completion notification describes the canonical page state read after automatic marking finishes. A later team mark does not send a second page-complete alert. The existing admin queue remains the source for that work. A durable final team-completion notification needs a separate committed transition or outbox design.
- Recovery of an uncertain first upload through GET does not emit an upload-success alert. A fresh successful upload has the event. The stored photo record remains authoritative.
- The event module has no SDK or Next import. Without an observer, failures keep a fixed-code console diagnostic. The standalone voice worker can load the shared call module, but it does not register the Next observer. No worker deployment is part of this change. Voice-room model, speech, live connection, and worker persistence coverage needs a separate worker-compatible transport, privacy checks, deployment, and live-call proof. The server route covers its own ticket/request failures and any committed transitions it performs, including stale-call recovery.
- This does not add all-page replay, client click tracking, or a new conversation store. Existing `maya_calls`, scan records, Sentry browser errors, and consent-gated error replay stay in use.
- No live Sentry, Slack, database, browser, or paid AI operation is part of the local checks. The parent task must record the live configuration and results before it claims coverage for today's customer.
