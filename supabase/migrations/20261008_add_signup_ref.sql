-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_signup_ref, 2026-10-08.
-- BC signups add a card on Stripe. The server makes a random ref, saves it here and on the Stripe
-- customer (metadata ref, and client_reference_id on the Checkout Session), so each card matches one signup.
-- Nullable so rows from before this change, and waitlist rows, stay valid.
alter table public.signups add column ref uuid unique;
