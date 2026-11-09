-- Item 12 of docs/state-machines.md (signup and the sign-in link). Additive: one new table and three new functions; no
-- existing table, column or function changes. The code that calls them ships after this migration; the code on main
-- keeps working in between, because it calls none of them.
--
-- 1. issue_sign_in_link: the sign-in link rate limit (MAX_LINKS_PER_HOUR in src/lib/sign-in-link.ts) as one locked
--    step. Before, sendSignInLink counted the parent's links of the last hour and then inserted a row in two requests,
--    so parallel requests could all read a count under the limit, all insert and all send an email. Now the count and
--    the insert run in one transaction under a lock for the parent, with the database's clock.
--    Answers 'created', 'too_many' or 'not_found' (no such child for this parent). The family write fence on
--    sign_in_links still refuses a family that is being deleted (the call then fails, as the insert did before).
--
-- 2. family_finish_claims, claim_family_finish and release_family_finish: one /api/account/finish at a time for a user.
--    The route changes the password before create_family (to a random one, then the parent's own), and create_family
--    takes its lock only after. Two tabs that finish at once could each change the password; the tab that then found
--    the family made answered "existing" with its password write already done (or with a random password nobody
--    knows, when it sent none). The claim is taken before the first password change and let go when the route ends.
--    Answers 'claimed', 'exists' (the parent row is there: change nothing) or 'busy' (another live claim holds it).
--    A claim older than 5 minutes is dead: Vercel stops a function after 300 s, so no route still holds it.

create function public.issue_sign_in_link(p_parent uuid, p_child uuid, p_token_hash text, p_max integer, p_ttl_seconds integer)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('public.issue_sign_in_link:' || p_parent::text, 0));
  if not exists (select 1 from public.children where id = p_child and parent_id = p_parent) then
    return 'not_found';
  end if;
  if (select count(*) from public.sign_in_links where parent_id = p_parent and created_at > now() - interval '1 hour') >= p_max then
    return 'too_many';
  end if;
  insert into public.sign_in_links (parent_id, child_id, token_hash, expires_at)
    values (p_parent, p_child, p_token_hash, now() + make_interval(secs => p_ttl_seconds));
  return 'created';
end $$;

revoke all on function public.issue_sign_in_link(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.issue_sign_in_link(uuid, uuid, text, integer, integer) to service_role;

-- One row per Auth user with a finish running (or one that stopped without letting go). No family data: only the user
-- id, the claim's random id and its time. Goes with the Auth user.
create table public.family_finish_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claim uuid not null,
  claimed_at timestamptz not null default now()
);
alter table public.family_finish_claims enable row level security;
revoke all on table public.family_finish_claims from anon, authenticated;

create function public.claim_family_finish(p_user uuid, p_claim uuid)
returns text
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('public.claim_family_finish:' || p_user::text, 0));
  if exists (select 1 from public.parents where id = p_user) then
    return 'exists';
  end if;
  if exists (select 1 from public.family_finish_claims
             where user_id = p_user and claim <> p_claim and claimed_at > now() - interval '5 minutes') then
    return 'busy';
  end if;
  insert into public.family_finish_claims (user_id, claim, claimed_at) values (p_user, p_claim, now())
    on conflict (user_id) do update set claim = excluded.claim, claimed_at = excluded.claimed_at;
  return 'claimed';
end $$;

create function public.release_family_finish(p_user uuid, p_claim uuid)
returns void
language sql
set search_path = ''
as $$ delete from public.family_finish_claims where user_id = p_user and claim = p_claim $$;

revoke all on function public.claim_family_finish(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_family_finish(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_family_finish(uuid, uuid) to service_role;
grant execute on function public.release_family_finish(uuid, uuid) to service_role;
