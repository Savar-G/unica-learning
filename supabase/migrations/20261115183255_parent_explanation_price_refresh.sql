alter table public.parent_explanation_prices
  add column approved_metadata jsonb,
  add column last_observed_metadata jsonb,
  add column last_checked_at timestamptz,
  add column check_error text;

create function public.reverify_parent_explanation_price(p_metadata jsonb, p_error text default '') returns text
language plpgsql security definer set search_path='' as $$
declare price public.parent_explanation_prices; at_time timestamptz; failure text;
begin
  select * into price from public.parent_explanation_prices where model='anthropic/claude-haiku-5.5' for update;
  at_time:=clock_timestamp();
  if not found or not price.enabled then return 'disabled'; end if;
  if coalesce(price.last_checked_at,price.verified_at)<=at_time
    and coalesce(price.last_checked_at,price.verified_at)>at_time-interval '23 hours' then return 'not_due'; end if;
  failure:=case
    when p_error in ('public_price_read_failed','incompatible_metadata') then p_error
    when coalesce(p_error,'')<>'' then 'verification_failed'
    when price.approved_metadata is null then 'missing_approved_metadata'
    when p_metadata is distinct from price.approved_metadata then 'price_metadata_changed'
    when price.protocol<>'parent-problem-v1' or price.max_input_bytes<>16384 or price.max_tokens<>768
      or price.maximum_micros is null or price.maximum_micros<2202535 or price.maximum_micros>10000000
      or price.verified_at>at_time then 'incompatible_bound'
    else null end;
  update public.parent_explanation_prices set last_checked_at=at_time,last_observed_metadata=p_metadata,check_error=failure,
    enabled=failure is null,verified_at=case when failure is null then at_time else verified_at end
    where model=price.model;
  return case when failure is null then 'verified' else failure end;
end $$;
revoke all on function public.reverify_parent_explanation_price(jsonb,text) from public,anon,authenticated;
grant execute on function public.reverify_parent_explanation_price(jsonb,text) to service_role;
