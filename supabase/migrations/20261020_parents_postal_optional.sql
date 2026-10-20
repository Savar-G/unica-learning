-- Short phone signup (D-134). Additive: a parent who signs up on a phone gives no postal code, so the column takes a
-- null. The check stays: a postal code that is given must still be Canadian. create_family passes p_postal through
-- unchanged, so it needs no change. Live code before this change always sends a postal code, so it keeps working.
alter table public.parents alter column postal drop not null;
