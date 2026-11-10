# Workbook welcome and delivery emails

A welcome email follows a confirmed saved card for the program. It asks the parent to allow 5 to 7 days to prepare the first workbook. It says that another email will follow when the workbook is on its way. It covers mail with tracking and local hand delivery. Creating an account or choosing a plan without saving a card sends no welcome.

The welcome now adds the approved "You have nothing to do right now." paragraph and the feedback contact line after the existing text. This addition is based on main after PR #678 merged at `6410132`. The founders' signature remains unchanged.

All current email texts, including the free-month variants for children below Grade 3 and Grade 3 or above, are in [workbook-email-copy.md](workbook-email-copy.md). These examples are generated from the templates with sample names and shipment values.

On the admin workbook screen, the email controls appear below **Print and ship** after the workbook is marked printed. The family, child, saved card and workbook number come from that stored workbook. **Workbook ready** is unavailable after it is marked shipped. A child without a confirmed saved card has no email controls.

In **Admin > Plans and delivery**, open **Workbook emails** on the child's saved card. The same controls appear on the family and child records, with a workbook number field for these manual sends.

1. For an earlier signup, select **Preview welcome email**. Review the recipient and text. Select **Send welcome email**.
2. When the printed workbook is ready, select **Workbook ready**. Review the recipient and text. Select **Send workbook ready email**.
3. After a workbook leaves you, select **Hand delivery** or **Courier**. Courier requires a carrier and tracking number. An HTTPS tracking link is optional. Select **Preview courier email** after entering the details. Hand delivery opens its preview with no tracking fields.
4. Review the recipient, workbook number and text. Select **Send delivery email**. Hand delivery and Courier share one dispatch key, so choosing the other method cannot send a second copy.
5. Only after the first workbook arrives at the family's home, use **Workbook delivered: start plan** and confirm delivery. The full 30-day free month begins at that confirmation. Sending an email does not start a subscription or change workbook status.

The ready email says that the workbook is ready and will be shipped soon. The delivery email says that it is on its way. Neither email claims arrival. Neither changes the workbook status, starts a plan or changes billing. The existing reminder before the first charge remains separate.

## Release block

The ready, hand delivery and courier words were approved by Savar on 2026-11-06 in [#681](https://github.com/Savar-G/unica-learning/issues/681#issuecomment-6692148719), with the updated feedback contact line in [the later comment](https://github.com/Savar-G/unica-learning/issues/681#issuecomment-6692204855). The optional tracking link remains supported. With no link, the courier email matches the approved sample exactly, apart from family and shipment values.

**Do not merge or release this PR until the Parent Dashboard thread supplies the required evidence.** Every workbook email, including the welcome immediately after a saved card, links to `https://unicalearning.com/account/feedback` with no query. Feedback must work for every signed-in parent at every stage, including a parent with no workbook. It must not depend on workbook or dashboard readiness. The evidence must cover the merged LIVE route, no-workbook access, sign-in and return to Feedback, family access and the desk lock.

The free-month email also links to `https://unicalearning.com/account/schedule` with no child query. Release needs merged route and browser evidence, correct multi-child scope and agreement with the stored book and day numbers on printed page 2. The approved "Explain this problem" wording is a content dependency on #675. Its function is not present at this base commit. Family switches remain unchanged.

## Free-month instructions

The free-month email keeps the price, first charge date, monthly billing, reminder and cancellation terms. It adds the exact approved parent instructions for the schedule, finished-page scanning, marks, explanations and contact. Grade 3 to Grade 9 children also get the Maya chat setup step. The grade is loaded from the saved card's own child, with the family filter. A younger or invalid grade gets no Maya step. No email offers voice calls. PIN and notice instructions point to Parent home so the parent selects the correct child before opening a desk.

The plain account routes in these emails always use the approved production addresses. Preview hosts and request origins cannot change those links. The first charge date still uses the family time module.

## Send status

Each welcome has one key per saved card. Each ready email has one key per saved card and workbook number. Each delivery email has a separate key per saved card and workbook number. The database locks the card while claiming that key. It records the recipient, message and tracking details before the provider call. A second click cannot change a claimed email or send another copy.

A definite provider refusal permits a retry. A timeout, lost response or uncertain provider result does not permit a retry. A send left running for 10 minutes shows as uncertain and remains held. Check the provider before sending any correction by hand. Do not change the workbook number to retry the same workbook. A sent email's tracking details cannot be changed through this form.

A pending welcome is skipped when ready or dispatch is recorded. An active welcome send temporarily blocks later stages. Dispatch also waits for an active ready send for that workbook. After 10 minutes, an abandoned earlier send becomes uncertain and permits the later stage, but never a retry of the earlier send. A queued or refused ready is skipped when dispatch starts. Ready cannot be sent after a dispatch claim for that workbook.

## Automatic welcome delivery

The card confirmation transaction queues a welcome for new card setups. The thank-you handler attempts it after its response. The protected `/api/workbook-emails` worker also checks for confirmed Stripe cards when a parent closed Checkout without returning. It processes at most two previously unchecked or least recently checked eligible card setups and two pending welcomes per run. A Stripe read that finishes after its time limit cannot record the card or send an email.

The Supabase job `workbook-welcome-emails` runs at minutes 7, 22, 37 and 52. It derives its destination from the existing Vault `reminders_url`, with `/api/reminders` replaced by `/api/workbook-emails`. It uses the existing `reminders_cron_secret` and optional preview bypass. No new secret is needed. A backlog can take more than one run. Definite welcome refusals have at most three automatic attempts; the admin can retry a confirmed refusal explicitly.

Existing card setups have automatic welcomes off. New setups default to on. This avoids sending old families a welcome on deployment. The admin can send an earlier signup's welcome explicitly.

`POST /api/workbook-emails?dry=1` with the cron bearer secret counts pending welcomes and makes no writes, Stripe calls or provider calls. Ordinary calls require the server's database key, email sender and Resend key. Missing configuration does not consume a claim.

## Storage and permissions

Migration `20261101_add_workbook_emails.sql` creates the send ledger, queue trigger, service-only claim function and cron job. Admins can read the records through their own session. Parents and visitors cannot read or write them. Only the server can claim a send. The server loads the recipient from the saved card's family, not from request input. Family write fences and deletion cascades cover the records.

The migration was applied to `cdjobwsyzndtltzfpyqa` as `add_workbook_emails`, version `20261101232236`. Database types were regenerated from the hosted schema.

Run `supabase/tests/workbook_emails.sql` against the project to check database behavior. The probe uses synthetic rows and rolls them back. It makes no provider calls. Unit and adapter tests are `src/lib/workbook-email*.test.ts`.

Migration `20261106181619_workbook_ready_emails.sql` adds the ready kind and ordered claims. It was applied as `workbook_ready_emails`, hosted version `20261106182253`. Both the original probe and `supabase/tests/workbook_ready_emails.sql` passed on the hosted project. Database types were regenerated. The generated `scan_marking_saved_command` entry also reflects a previously applied marking migration; this change does not call it.
