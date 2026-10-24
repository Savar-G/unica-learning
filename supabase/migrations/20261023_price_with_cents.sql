-- Prices with cents (2026-10-23): math is CAD 79.99 a month (first month free since 2026-10-24). The plan price a family
-- chose was a whole number of dollars (smallint); it becomes numeric(6,2). Additive for the live code: whole-dollar
-- prices still fit, and each column keeps its check (1 to 500).
alter table public.signups alter column price type numeric(6,2);
alter table public.card_setups alter column price type numeric(6,2);

-- The signup booking casts the price it receives; it now keeps the cents. Grants stay with create or replace.
create or replace function public.begin_booking_signup(payload jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.signups(status, ref, name, email, postal, plan, subject, grade, curriculum, price, source)
  values(payload->>'status', (payload->>'ref')::uuid, payload->>'name', lower(payload->>'email'),
    payload->>'postal', payload->>'plan', payload->>'subject', (payload->>'grade')::smallint,
    payload->>'curriculum', (payload->>'price')::numeric(6,2), coalesce(payload->'source', '{}'::jsonb));
  return true;
end $$;
