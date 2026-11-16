# Product monitoring

Status: repository implementation, 2026-11-16. Base: `45222b0be65b5fefe9583ede6854beeb8a285892`.
This document does not confirm a deployment or a live Slack or Sentry check.
The parent task owns service configuration, independent review, and release.

## Data and delivery

`src/lib/product-monitoring.ts` accepts fixed event codes. It removes unknown keys and values.
Only `photoId` and `callId` UUIDs, bounded whole-number counts, and the enums in that file can pass.
No exception object, message, name, email, child words, question, answer, photo, prompt, token, or full request can pass.

The Next Node server registers `productObserver` in `src/instrumentation.ts`. The standalone voice worker registers its own observer per job in `worker/maya-voice/src/monitoring.ts`. Both hosts use `src/lib/product-monitoring-delivery.ts` for the same private Slack payload, destination checks, timeout and failure handling.
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
Other events create info logs. `scan.marking_deferred` and `maya.voice_provider_retry` have no Slack alert.

| Code | Committed boundary or handled failure | Repetition rule |
| --- | --- | --- |
| `scan.upload_committed` | The upload holder receives committed `pending` from finish or the unfinished-photo swap. A second spread page can also reach this point after reconciliation. | An already stored PUT retry returns before emission. A read emits nothing. |
| `scan.upload_failed` | Upload admission, storage, finish, or unexpected upload processing failure. An uncertain result is a failure to confirm, not proof that bytes were lost. | Each failed attempt can emit. Bad images, invalid QR codes, duplicate pages, and ordinary refusals do not create issues. |
| `scan.send_accepted` | `send_scan_photos` or `send_due_scan_photos` returns newly sent rows for one child. | Only the returned new rows count. An empty retry result emits nothing. |
| `scan.send_failed` | A Send write fails, including a partial family Send, or the route catches a failed read. | Each failed attempt can emit. |
| `scan.check_failed` | Background crop or photo-check work throws, or task registration fails. | A refused photo check is an expected result, not an exception. |
| `scan.marking_complete` | The marking lease holder commits finish. The canonical effective page view reports complete. | Finished-job claims cannot reach finish again. Reads emit nothing. |
| `scan.marking_team_pending` | The same committed finish has pending answers or team checks. | This is not a page-complete notification. |
| `scan.team_mark_saved` | The admin mark RPC confirms a new saved answer version. | A conflict or not-waiting retry emits no success. This is an answer receipt, not a whole-page completion claim. |
| `scan.team_mark_failed` | The admin mark write fails or returns an invalid result. | Expected conflicts and refusals do not create issues. |
| `scan.marking_deferred` | The marking operation pauses for an expected admission or confirmed rate-limit outcome. | Info only. Budget, switch, and price outcomes do not create failure issues. |
| `scan.marking_failed` | A provider or extraction failure becomes pending, a second look fails unexpectedly, or Send's per-photo work throws. | A later attempt can emit again. A failed second look can coexist with a completed first read. |
| `scan.recovery_failed` | A due-send read or deferral fails, the recovery loop catches a per-photo or profile failure, or marking background work cannot run. | Recovery can report the same unresolved failure on a later run. |
| `maya.started` | The revision write first stores a non-null session start time. A voice ticket alone is not a conversation start. | Compare the old record with the committed change. |
| `maya.ended` | The revision write moves a live call to ended, except a technical-issue outcome after a session started. A ticket cancelled before Maya joins is an expected end. | Later note, event, profile, and end retries do not repeat the lifecycle event. |
| `maya.safety_flagged` | A revision write commits a higher safety flag. | Once for each committed rise. The existing safety email remains separate. |
| `maya.failed` | A model request fails unexpectedly, a call ends with a technical-issue outcome, or chat/voice request work fails. Stream failure after the first sentence is included. | Several distinct failures within a call can emit. Spend refusals do not become model failures. |
| `maya.worker_failed` | Voice job setup or entry throws, its provider configuration is invalid, or a fatal process error occurs. | Fatal exception content is replaced with the fixed code. No raw stack or message is exported. |
| `maya.voice_provider_failed` | LiveKit reports an unrecoverable speech/model provider error. | Distinct from a later committed technical-issue call outcome. |
| `maya.voice_provider_retry` | LiveKit reports a recoverable provider error. | Info only; the session continues. No Slack message. |
| `maya.recovery_failed` | A caught safety read, history, learning-event, note, or voice persistence failure, or stream lifetime registration failure. | A later recovery attempt can emit again. |
| `feedback.received` | `submit_feedback` returns `saved`. | An exact retry returns `duplicate` and emits nothing. Feedback text stays in the protected table. |
| `feedback.failed` | The feedback store throws or returns an invalid admission result. | Validation, rate limits, conflicts, and family deletion refusals are expected. |
| `dashboard.request_failed` | The scan stack fails, its optional book or marks read fails, or handled chat-access/usage reads fail. | Each failed read can emit. Existing Sentry still handles browser navigation and render exceptions. |

## Configuration and verification

1. Keep the existing Sentry configuration in [sentry.md](sentry.md).
2. Set the server-only `SLACK_PRODUCT_ALERTS_WEBHOOK_URL` in Vercel Production to the webhook for `#product-alerts`.
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

Run `node supabase/tests/scan_send_receipt.cjs` for the local SQL Send/retry concurrency probe. Family and active-photo checks are synthetic in that probe. The hosted function is service-only and preserves the existing family write fence.

The focused tests verify privacy, the production gate, timeout, refusal, scheduler failure, recovery, and event wiring.
Fake stores and transports do not prove hosted database behavior or provider delivery.
The full gate verifies repository compatibility. It does not prove a customer session.

## Known limits

- This is best-effort operational notification, with no durable outbox or migration. A crash after a product commit and before emission can lose the alert. A timeout can mean Slack accepted the message but the response was lost. The code does not retry Slack. The protected product records remain authoritative.
- The completion notification describes the canonical page state read after automatic marking finishes. Each later committed team mark sends an answer receipt. It does not claim whole-page completion. A durable final team-completion notification needs a separate committed transition or outbox design.
- Recovery of an uncertain first upload through GET does not emit an upload-success alert. A fresh successful upload has the event. The stored photo record remains authoritative.
- The event module has no SDK or Next import. Without an observer, failures keep a fixed-code console diagnostic. The worker observer requires its own deployment and explicit environment setting. Local checks do not prove deployed voice audio, provider behavior or live-call delivery.
- This does not add all-page replay, client click tracking, or a new conversation store. Existing `maya_calls`, scan records, Sentry browser errors, and consent-gated error replay stay in use.
- No live Sentry, Slack, database, browser, or paid AI operation is part of the local checks. The parent task must record the live configuration and results before it claims coverage for today's customer.

## Voice worker configuration

Set `MAYA_VOICE_MONITORING=production` and the server-only `SLACK_PRODUCT_ALERTS_WEBHOOK_URL` on the LiveKit worker. Set `MAYA_MONITORING_RELEASE` to the exact deployed commit. Use `preview` for Sentry-only test-worker events; local workers send nothing by default. Vercel variables do not reach the separate worker.

The worker uses pinned `@sentry/node` 11.12.0. Automatic HTTP, database and console collection are absent. Fatal exception integrations pass through a final allowlist that removes the exception and retains only `maya.worker_failed`. Structured logs retain only fixed product codes and approved attributes. Audio recording and LiveKit session observability remain off.

Delivery starts without holding the turn. The process holds at most 32 pending Slack tasks. A full queue creates `monitoring.schedule_failed`. A call end waits for delivery after its last stored transition. Job shutdown also drains delivery. Each Slack task has a two-second limit. Sentry flush has its own two-second limit. These are best-effort operations; a killed process can still lose an alert.

Check the deployed worker version and environment before a test call. Verify one committed start, end and provider-failure event with an authorized fake-provider call. Check the protected transcript separately. Do not enable audio/session recording to obtain operational alerts.

## Live configuration evidence, 2026-11-16

Sentry issue rule 6351733 routes errors and monitor issues to `#product-alerts` in the Unica Learning Slack workspace. Existing email delivery remains. A labeled synthetic Sentry notification arrived in that channel. The minimal Unica Product Alerts app has only `incoming-webhook` permission for this channel. A second labeled direct webhook test returned HTTP 200 and appeared in the channel. The webhook is stored as a secret in Vercel Production. This proves the two delivery connections. It does not prove a deployed product action.

The source-map upload token is present in Vercel Production. Sentry lists artifacts for production release `45222b0be65b`. The retained traces and logs are arriving. Two initial monitor-not-found records preceded creation of `scan-cleanup` and `scan-progress`; both have later successful check-ins. `family-retention` awaits its first scheduled check-in with the new workflow code. Its last completed pre-instrumentation workflow passed. No synthetic retention-success check-in was sent.

The `scan_send_receipt` migration adds `send_scan_photos_receipt`. It holds the existing scan advisory lock and row locks while it records which requested pages were unsent, calls the existing Send function, and returns both recovery IDs and newly sent IDs. Only newly sent IDs produce a Send receipt. The old function stays available. Hosted migration version: `20261116190648`; local filename: `20261116190600_scan_send_receipt.sql`. Generated database types include the new RPC. Hosted permission checks confirm no anonymous or authenticated access. A nonexistent-family probe failed closed with `family_unavailable`.

Sentry metric monitor [Production warning and error logs](https://unica-learning.sentry.io/monitors/10975234/) is enabled for production logs. Its query is `severity:[warn,error,fatal] -has:product_event`, count above zero over five minutes. The existing project Slack alert applies. This closes the standalone warning/error log alert gap. The saved rule is verified; a monitor-triggered delivery remains unverified. The channel was renamed to `#product-alerts` with its ID unchanged.

The voice worker filters serialized log envelopes immediately before transport. Sentry 11 merges ambient scope attributes after `beforeSendLog`, so that callback alone cannot enforce the privacy boundary. The final allowlist removes global, isolation and current scope attributes. Actual SDK envelope tests cover all three sources in production and preview. No live child-data export was established by the synthetic failing control.
