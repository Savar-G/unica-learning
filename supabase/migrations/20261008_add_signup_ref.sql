-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_signup_ref, 2026-10-08.
-- BC signups pay a refundable deposit through a Stripe Payment Link. The server makes a random ref,
-- saves it here and passes it to Stripe as client_reference_id, so each payment matches one signup.
-- Nullable so rows from before this change, and waitlist rows, stay valid.
alter table public.signups add column ref uuid unique;
