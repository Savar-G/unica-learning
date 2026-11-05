# Pause and paid Restart contract

Base: 89ecf73965eccbf0f59e49401b69cf09a4e12579.
Machine: Savars-MacBook-Pro-5.local.
Assigned worktree: /Users/savargupta/.t3/worktrees/pagewise-landing-page/t3-d34219bc.
Branch: t3/implement-plan-controls-1.

The dashboard release stays off. The existing access rule controls both new routes and their buttons.

## Supported states

- Initial start: first delivered book and no earlier subscription. One first free month only.
- Restart: ended subscription, current saved card, saved agreed price lowered by current planPrice. Charge immediately. No trial, new reminder, or delay.
- Pause in the first free month: extend its existing trial end with no prorations.
- Pause while paying: flexible billing, automatic collection, one monthly item, no existing schedule. Native pause at renewal and resume after the requested calendar weeks. No new trial or billing mode migration.
- Classic paid subscriptions and existing schedules: refuse safely. The parent must verify the supported provider path before release.
- Pending provider command: keep its durable record and family hold. Time and unrelated reads do not close it. Cancel and deletion wait.

## Binding rules

Pause uses whole weeks, at most eight per family-local calendar year per child. Pending requests reserve weeks. The server owns all dates, years, owner ids, prices and provider ids. A confirmation binds to the current quote. A stale quote makes no provider call.

A request through shipping day plus nine moves the next book. A later request leaves that book unchanged and moves the book after it. A future book with no shipping evidence has no invented date range. Shipment and preparation must obey the stored pause. Siblings keep their own dates.

A paid Restart leaves a durable request in the admin workflow. It does not claim that generation finished. The existing prepare action reads the current profile.

The existing Stripe reminder remains seven days before the first free month ends. Restart has no free month and no trial reminder.

## Falsifiers and findings list

1. Any repeat start sends trial_period_days or allows a cross-mode retry to change a request.
2. Two concurrent presses create two subscriptions, exceed quota, or send different terms under one key.
3. A stale quote, foreign row, missing delivery or disabled dashboard reaches a provider write.
4. Trial or paid Pause changes the charge by a different number of local calendar weeks.
5. A late Pause delays the next book or fails to delay the book after it.
6. Cancel or deletion succeeds while an unresolved command can later create or resume a plan.
7. A lost response releases its hold because a timer ended or an unrelated read succeeded.
8. A restart claims a generated book without a durable actionable request.
9. A new route bypasses origin, JSON, ownership, access or existing desk proxy rules.

Focused tests must fail for these cases before the related fix. The parent applies hosted SQL, generates database types, runs the full gate, checks the browser and obtains independent review. No hosted, browser or paid-provider proof is claimed here.
