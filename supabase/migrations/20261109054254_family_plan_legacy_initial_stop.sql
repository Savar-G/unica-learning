-- Restore deployed Restart admission before PR B ships. No family terms are imported.
create or replace function public.admit_plan_start_terms(p_card uuid,p_generation integer,p_key text,p_payment_method text,p_purpose text,p_monthly_cents integer,p_revision text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; p uuid; last public.plan_starts; control public.child_plan_controls;
begin
  select child_id,parent_id into c,p from public.card_setups where id=p_card;
  if c is null then raise exception 'plan_start_no_card_setup'; end if;
  perform 1 from public.parents where id=p for update;
  perform public.plan_control_owner(p,p_card);
  if exists(select 1 from public.plan_control_operations where child_id=c and state='open') then raise exception 'plan_control_pending' using errcode='55000'; end if;
  select * into control from public.child_plan_controls where child_id=c;
  select * into last from public.plan_starts where card_setup_id=p_card order by generation desc limit 1;
  if p_purpose not in ('initial','restart') or p_monthly_cents<0 or p_generation<1 then raise exception 'invalid_start_terms'; end if;
  if (last.generation is not null and last.generation>=p_generation) or last.state='open' then
    -- An old initial caller sends trial fields without inspecting purpose. Never disclose a Restart key to it.
    if last.purpose<>p_purpose then raise exception 'restart_required' using errcode='55000'; end if;
    return public.plan_start_answer(last,false);
  end if;
  if p_purpose='initial' and (control.cancelled or exists(select 1 from public.plan_starts where card_setup_id=p_card and state in ('started','other'))) then
    raise exception 'restart_required' using errcode='55000';
  end if;
  if p_purpose='restart' and coalesce(control.revision::text,'')<>p_revision then raise exception 'stale_restart' using errcode='55000'; end if;
  insert into public.child_card_updates(child_id,parent_id) values(c,p) on conflict(child_id) do nothing;
  perform 1 from public.child_card_updates where child_id=c for update;
  if coalesce(last.generation,0)<>p_generation-1 then raise exception 'plan_start_generation_gap'; end if;
  -- Only a new sibling initial start is stopped. Preserve every earlier legacy validation and replay.
  if p_purpose='initial' and (exists(select 1 from public.family_plan_windows where parent_id=p and not released and first_child_id<>c)
    or exists(select 1 from public.plan_starts s join public.card_setups k on k.id=s.card_setup_id
      where s.parent_id=p and k.child_id<>c and s.state in ('open','started','other'))
    or exists(select 1 from public.child_plan_states where parent_id=p and child_id<>c and kind<>'not_started')) then
    raise exception 'family_plan_upgrade_required' using errcode='55000';
  end if;
  insert into public.plan_starts(card_setup_id,generation,parent_id,start_key,payment_method_id,purpose,monthly_cents)
    values(p_card,p_generation,p,p_key,p_payment_method,p_purpose,p_monthly_cents) returning * into last;
  return public.plan_start_answer(last,true);
end $$;
