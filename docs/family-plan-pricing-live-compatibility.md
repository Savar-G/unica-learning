# PR B: deployed-call compatibility

## Result

Option (b) completed at 04:05 UTC on 9 November 2026, before the 05:30 UTC deadline.

The first rolled-back live comparison failed. Migration `20261109032547_family_plan_pricing` had changed the deployed admission. Its single-child response used a whole-second wall-clock timestamp instead of the original transaction timestamp. It also opted the old caller into family records and added family trial fields. Main still sends its own relative 30-day trial. Those contracts were not identical.

The old wrapper refused an amount that differed from the caller's amount. It did not silently return 5999 cents to an old caller that sent 7999 cents. The initial backfill could put a lower future sibling amount in the new price ledger while an existing provider subscription retained its earlier amount. No real family's Stripe amount was checked in this task.

The corrective additive migration is `20261109040516_family_plan_legacy_shape`. A fresh legacy call now retains its supplied monthly amount, original timestamp, original answer shape and original terms shape. It does not set `family_terms` or an absolute `trial_end`. A single child's initial start and Restart retain their prior results. A legacy sibling attempt still raises `family_plan_upgrade_required`, as the chief of staff explicitly accepted.

`20261109041204_family_plan_history_admission` changes only PR B entry points. Its history import runs only when PR B calls `admit_family_plan_start`. The old deployed function does not call it. It prevents a legacy first start made before code deployment from giving a later sibling another free window. The PR B price preview also reads that legacy history.

`20261109042134_family_plan_legacy_window` changes only that new private history helper. It aligns an earlier migration-created window with the first plan's saved first-charge receipt before any PR B sibling has been admitted. Main does not call this helper. A failing rolled-back probe reproduced a five-second difference before this fix. The same probe passed after it. The full six-case main comparison passed again after this migration.

## Existing functions replaced

| Function | First migration | Current behavior after correction |
| --- | --- | --- |
| `plan_start_terms(uuid,integer)` | Added `family_terms` and `trial_end` to its JSON. | Original JSON, only `purpose` and `monthly_cents`. PR B uses the new `family_plan_start_terms`. |
| `plan_start_answer(plan_starts,boolean)` | Added the family flag and absolute trial end to its JSON. | Original answer shape. PR B uses the new private `family_plan_start_answer`. |
| `admit_plan_start_terms(uuid,integer,text,text,text,integer,text)` | Called family admission, reserved the family, changed the start timestamp and checked whether the old payload matched the new terms. | Original one-child admission, amount and timestamp. An exclusive parent lock serializes the accepted legacy sibling stop. No family opt-in on the old call shape. |
| `finish_plan_start(uuid,integer,text,text,timestamptz,boolean)` | Added parent locking and confirmation or release of family reservations. The first replacement also omitted the prior deletion email condition. | For a legacy row, the original deletion-safe body. For a row explicitly admitted with `family_terms=true`, it dispatches to new private `finish_family_plan_start`. That function also keeps the deletion email condition. |
| `admit_family_plan_start(...)` | New in PR B, so it did not replace an origin/main function. | Later migrations replaced this new function to use its own answer helper and import legacy history only after PR B opts in. Main does not call it. |
| `family_plan_price(uuid,uuid,integer)` | New in PR B. | The later history migration replaced this new read so a PR B preview recognizes legacy history before admission. Main does not call it. |
| `seed_family_plan_history(uuid)` | New in the PR B history migration. | The window follow-up replaced it to align legacy metadata with the saved first-charge receipt, only before a new sibling admission. Main does not call it. |

The new family answer, terms, finish and history helpers had no pre-PR-B definition. No other existing live function was replaced by these migrations. In particular, `card_recovery_rows`, `plan_control_context`, `save_child_plan_state`, `claim_plan_start_email`, `note_plan_start_email_send` and `note_plan_start_email` were not changed.

## Rolled-back live comparison

Source pin: origin/main `724f38b488d3a9ce36d2136b8bf1ea4050d2b2f0`.

`supabase/tests/family_plan_legacy_compatibility.sql` contains the original four function definitions from that pin. It compares the original and migrated functions in the same transaction. Each baseline and actual case runs in a subtransaction that rolls back. The same synthetic IDs and transaction time are reused, so timestamps and identifiers compare exactly. A missing result or any unequal JSON field fails the probe.

The result includes the admission and terms answers, card-recovery reads by card and customer, the start's stored fields, plan-control context, the sweep's rows, the Account plan-state row written through `save_child_plan_state`, Restart requests, and the email claim and completion fields. The probe supplies fixed read-order values. It does not advance the plan-read sequence. All synthetic rows and temporary function replacements roll back.

| Case | Monthly cents | Trial seconds | Full captured results equal |
| --- | ---: | ---: | --- |
| Initial, saved at 79.99 | 7999 | 2592000 | yes |
| Initial, saved at 49.00 | 4900 | 2592000 | yes |
| Initial, older 99.00 offer | 7999 | 2592000 | yes |
| Restart, saved at 79.99 | 7999 | none | yes |
| Restart, saved at 49.00 | 4900 | none | yes |
| Restart, older 99.00 offer | 7999 | none | yes |

The comparison passed before applying the correction, with the correction included in a rolled-back block. It passed again after application. It passed again after the history migration and the legacy-window follow-up. Final marker: `LEGACY_COMPATIBILITY_AND_PR_B_OPT_IN_OK`.

`supabase/tests/family_plan_legacy_history_probe.sql` additionally proves that a fresh old-call start writes no family window. A second old-call start is refused and leaves no admission. The new PR B preview gives that sibling 5999 cents. Only the new PR B admission imports the existing window and returns 5999 cents with the first child's original trial end.

These are live database-function and contract comparisons. They do not prove a real Stripe request or email delivery. No Stripe request or email was sent.

## Main's admin message

Frozen origin/main route and component controls are kept beside the tests. For `family_plan_upgrade_required`, the old route catches the database exception and returns HTTP 502 with `error: failed`. The old card then shows:

> Stripe could not start the plan. Check Stripe before trying again.

It does not show the raw SQL error. Public-interface tests reproduce both steps. PR B returns HTTP 409 with the specific code. The card maps it to:

> This child is a sibling. Their price (CAD 59.99) can start once the sibling update ships.

This new message is under Needs Savar in the PR body.

## Pending coarse email state after a successful send

The live comparison reproduces `email_state=pending` with `email_send_status=sent` on every initial case, both before and after PR B. The send-ledger completion does not update the coarse state. The initial route also does not call `note_plan_start_email` after its successful send.

The send ledger prevents a second claim once its status is sent. The probe checks that the second claim returns false. A later sweep gets the existing sent claim and calls `note_plan_start_email`, which changes the coarse state to sent. The probe checks that final read too. Pending alone does not mean that the email was not sent. A stalled sweep can leave the coarse state pending and the row due, but it does not admit a duplicate send.

PR B changes the email's amount, date and words. It does not change these claim or send-completion functions. It does not add an unrelated email-state repair.
