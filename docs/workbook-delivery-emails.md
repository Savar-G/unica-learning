# Workbook welcome and delivery emails

A welcome email follows a confirmed saved card for the program. It asks the parent to allow 5 to 7 days to prepare the first workbook. It says that another email will follow when the workbook is on its way. It covers mail with tracking and local hand delivery. Creating an account or choosing a plan without saving a card sends no welcome.

In **Admin > Cards and waitlist**, open **Workbook emails** on the child's saved card. The same controls appear on the family and child records.

1. For an earlier signup, select **Preview welcome email**. Review the recipient and text. Select **Send welcome email**.
2. After a workbook leaves you, enter its workbook number. Keep the same number for the same workbook.
3. Select **Mail with tracking** or **Hand delivery**. Mail requires a carrier and tracking number. An HTTPS tracking link is optional. Hand delivery has no tracking fields.
4. Select **Preview delivery email**. Review the recipient and details. Select **Send delivery email**.
5. Only after the first workbook arrives at the family's home, use **Workbook delivered: start free month** and confirm delivery. The full 30-day free month begins at that confirmation. Sending an email does not start a subscription or change workbook status.

The delivery email says that the workbook is on its way. It does not claim that it has arrived. A separate workbook-ready email is unnecessary. The existing promised reminder before the first charge remains separate.

## Send status

Each welcome has one key per saved card. Each delivery email has one key per saved card and workbook number. The database locks the card while claiming that key. It records the recipient, message and tracking details before the provider call. A second click cannot change a claimed email or send another copy.

A definite provider refusal permits a retry. A timeout, lost response or uncertain provider result does not permit a retry. A send left running for 10 minutes shows as uncertain and remains held. Check the provider before sending any correction by hand. Do not change the workbook number to retry the same workbook. A sent email's tracking details cannot be changed through this form.

A pending welcome is skipped when dispatch is recorded. An active welcome send temporarily blocks dispatch. After 10 minutes, an abandoned welcome claim becomes uncertain and permits dispatch, but never a welcome retry.

## Automatic welcome delivery

The card confirmation transaction queues a welcome for new card setups. The thank-you handler attempts it after its response. The protected `/api/workbook-emails` worker also checks for confirmed Stripe cards when a parent closed Checkout without returning. It processes at most two previously unchecked or least recently checked eligible card setups and two pending welcomes per run. A Stripe read that finishes after its time limit cannot record the card or send an email.

The Supabase job `workbook-welcome-emails` runs at minutes 7, 22, 37 and 52. It derives its destination from the existing Vault `reminders_url`, with `/api/reminders` replaced by `/api/workbook-emails`. It uses the existing `reminders_cron_secret` and optional preview bypass. No new secret is needed. A backlog can take more than one run. Definite welcome refusals have at most three automatic attempts; the admin can retry a confirmed refusal explicitly.

Existing card setups have automatic welcomes off. New setups default to on. This avoids sending old families a welcome on deployment. The admin can send an earlier signup's welcome explicitly.

`POST /api/workbook-emails?dry=1` with the cron bearer secret counts pending welcomes and makes no writes, Stripe calls or provider calls. Ordinary calls require the server's database key, email sender and Resend key. Missing configuration does not consume a claim.

## Storage and permissions

Migration `20261101_add_workbook_emails.sql` creates the send ledger, queue trigger, service-only claim function and cron job. Admins can read the records through their own session. Parents and visitors cannot read or write them. Only the server can claim a send. The server loads the recipient from the saved card's family, not from request input. Family write fences and deletion cascades cover the records.

The migration was applied to `cdjobwsyzndtltzfpyqa` as `add_workbook_emails`, version `20261101232236`. Database types were regenerated from the hosted schema.

Run `supabase/tests/workbook_emails.sql` against the project to check database behavior. The probe uses synthetic rows and rolls them back. It makes no provider calls. Unit and adapter tests are `src/lib/workbook-email*.test.ts`.
