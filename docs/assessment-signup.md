# Public signup: what the hosted project needs (#82)

The signup at `/start` proves the parent's email with a one-time code before any account data is written (D-093). The code cannot set the Supabase settings below. Set them in the dashboard of project `cdjobwsyzndtltzfpyqa` before the launch deploy, and check them again after any Auth change.

## Order

1. Apply `supabase/migrations/20261012_add_family_admission.sql`. `/api/account/finish` calls `create_family`; without it, every new family fails with "We could not save your details".
2. Set the Auth settings and email templates below.
3. Deploy the code. Then remove `ASSESSMENT_PILOT` from the Vercel project; no code reads it.

## Auth settings

| Setting (Authentication) | Value | Why |
|---|---|---|
| Sign In / Providers, Email, Confirm email | On | Off, Supabase confirms any address at once. Anyone could then finish an account for an email they do not own. |
| Sign In / Providers, Allow new users to sign up | On | The email code creates the user. |
| Sign In / Providers, Email OTP length | 6 (default) | The page asks for "the code" and accepts 6 to 10 digits. |
| Sign In / Providers, Email, Minimum password length | 8 | The same as `PASSWORD_MIN`, which the forms check. Set on 2026-10-13. |
| Sign In / Providers, Email, Password requirements | No required characters | The forms ask only for a length. Before 2026-10-13 Supabase asked for lowercase, uppercase and a digit, and refused such passwords only after the parent had entered the code. Checked on 2026-10-13: `sunshine` is accepted and `sunshin` is refused. |
| Sign In / Providers, Email OTP expiration | 3600 seconds or less | The page states no time; "send a new code" covers an expired code. |
| Rate limits, emails sent per hour | Enough for launch traffic | Each signup sends one code email, and resets and phone links send more. The value recorded in PR #89 was 30 an hour for the whole project. |
| Rate limits, token verifications | Keep the default | It limits code guessing. |
| Identity linking | Keep automatic linking | Google then joins an existing confirmed account with the same email, and Supabase removes unconfirmed identities. |
| Sign In / Providers, Email, Require reauthentication when changing password ("Secure password change") | Off | `/api/account/finish` changes the password through the parent's own session. On, a session older than 24 hours gets `reauthentication_needed`; the route then answers "signed_out" and the parent must sign in again. Off on 2026-10-12 (checked with a session made 25 hours old). |
| Sign In / Providers, Email, Require current password when changing password | Off | On, a password change through a session needs the old password, unless the session came from a reset link. The route does not know the password it replaces, and it sets the parent's password over a random one. Auth's `current_password_required` response becomes `password_change_blocked`: the page says it cannot set the password and gives the support email. Off on 2026-10-12 (checked). |
| Email, Security notifications, Password changed (`password_changed_enabled`) | Off | The route changes the password twice when the parent chooses a password. On, each finish sends two password-change notifications, including one for the random password, and uses two of the project's 30 email slots per hour recorded in PR #89. Off on 2026-10-12, as recorded in #121. Check again after an Auth change. |

Keep the settings from PR #89: custom SMTP through Resend on `unicalearning.com`, Site URL `https://unicalearning.com`, the redirect allow list (`/auth/callback` for Google, `/auth/confirm` for password reset), and the password reset template with the token hash.

## Email templates

The "Confirm signup" and "Magic link" templates must show the code (`{{ .Token }}`) and no confirmation link. A link confirms the address in another tab or browser, away from the signup page that holds the parent's details and password. A new address gets "Confirm signup"; an address that already has an account gets "Magic link". Both answers look the same to the visitor.

## What the code guarantees, and what it does not

Supabase keeps the first password set for an unconfirmed address, so someone else can set a password for an email before its owner proves it (through Supabase's public signup). `/api/account/finish` keeps that password away from a family:

- Only a session that proved the email can make a family: the email code, an emailed sign-in or reset link, or Google. A password sign-in alone gets "confirm your email first".
- When no family exists yet, the route first gives the account a password that nobody knows and signs out every other session. Only then does it read the request, set the parent's own password and write the family. Until the parent's password is accepted, a later failure leaves the unknown password in place.
- Both password changes go through the parent's own session (`updateUser`, `PUT /auth/v1/user`). Supabase Auth then ends every other session of the user in the same transaction, and keeps the parent's session, so the parent stays signed in.
- After the last password change, the route checks the session again with Auth before it writes the family. If the session has ended, it writes no family and returns `signed_out`. On `/start`, this clears the saved email proof and returns to the form with the parent's entries intact. The next submission asks for a new code, so recovery does not depend on a password that was never saved. Each such retry sends one more code email. If Auth fails on this check for another reason, the route returns `store_failed` and the email proof stays.
- An account that already has a family changes nothing.

Do not change the password with the admin API (`updateUserById`) in this route. An admin password change ends every session of the user, the parent's own too. On 2026-10-12 this made every first signup fail: the route set an unknown password with the admin API, its next call (`signOut(jwt, "others")`) then failed with `session_not_found` ("Auth session missing!"), and the parent was left signed out, with a password nobody knows and no family. A parent in that state recovers on `/start`: they enter the same email, use the new code, and submit the form again. The route then sets the password they choose and writes the family. On 2026-10-12, no account was in that state.

What remains:

- Before the first password change, an earlier password can still open the empty account. A password-only session cannot make a family.
- GoTrue can load another session before the first password change and let its already-running `PUT /user` commit after this route's password changes. It does not check that session again inside the password-change transaction. That request can replace the password and end the parent's session. This race also existed before the #119 hotfix. The new session check detects a conflicting change that has already ended the parent's session. It shortens the window, but a conflicting change can still commit after that check. Auth and the family write do not share a transaction.
- An access token issued before the sign-out keeps working until it expires (1 hour by default), because the database checks the token, not the session. Its holder could read the new family's rows in that time. Lower the JWT expiry, or add a session check to row-level security, to shorten this. The route's new session check does not change row-level security.

The complete, branded email bodies are in `supabase/templates/`. Do not replace them with an unbranded code fragment.

| Dashboard template | Subject | Body file |
|---|---|---|
| Confirm signup | Your Unica Learning code | `supabase/templates/confirmation.html` |
| Magic link | Your Unica Learning sign-in code | `supabase/templates/magic_link.html` |
| Reset password | Reset your Unica Learning password | `supabase/templates/recovery.html` |

These files are generated from `src/lib/auth-email.ts` and the shared email design in `src/lib/email-brand.ts`. To regenerate them, run `node scripts/render-emails.mjs /tmp/unica-emails`, then copy only `confirmation.html`, `magic_link.html`, and `recovery.html` from that directory into `supabase/templates/`. The tests fail if these committed files differ from the source.

Merging a site PR does not install hosted Auth templates. After the email design PR is approved, install these three bodies and subjects in Authentication > Email Templates for project `cdjobwsyzndtltzfpyqa`. Read the saved values back. Keep confirmation and magic link code-only. Keep the reset URL `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`; its ampersands are HTML-escaped in the file. Do not change the redirect allow list or other Auth settings as part of the design change. This is the hosted template procedure in the [Supabase email template guide](https://supabase.com/docs/guides/auth/auth-email-templates).

Send each type to a team-controlled QA inbox after installation. Check the logo, signature, and address. Confirm that the code completes signup in the original tab. Confirm that the reset button opens the password form. Browser screenshots and source tests do not prove inbox rendering or hosted token substitution.

## Hosted checks after the deploy

Use two QA inboxes that the team controls. Do not use a Stripe test card with the live key.

1. Sign up with a new address. The email has a code and no link. A wrong code shows the error; the right code opens `/account` with the child. Sign out, then sign in on `/sign-in` with the password from the form: it opens `/account`.
2. Start a signup, do not enter the code, and try to sign in with that password on `/sign-in`. It must fail.
3. Sign up again with the address from step 1. The page shows the same message; the code opens `/account` with "This email already has an account"; the old password still works and the new one does not.
4. Set a password for a fresh QA address through Supabase's public signup (not our page). Then sign up for that address on `/start` with a different password and enter the code. The first password must fail on `/sign-in`, and the second must work.
5. On a phone, sign up. The form has no postal code and no password (D-134). `/account` shows the phone screen, and the sign-in link email arrives.
6. Google sign-in with a new Gmail address still reaches `/account/finish`, then `/account`.
