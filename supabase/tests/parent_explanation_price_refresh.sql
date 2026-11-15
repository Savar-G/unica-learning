begin;
do $$
declare approved jsonb:='{"model":"anthropic/claude-haiku-5.5","provider":"anthropic","price":"synthetic"}';
  before_verified timestamptz; after_verified timestamptz; before_spend bigint; result text;
begin
  if has_function_privilege('anon','public.reverify_parent_explanation_price(jsonb,text)','execute')
    or has_function_privilege('authenticated','public.reverify_parent_explanation_price(jsonb,text)','execute')
    or not has_function_privilege('service_role','public.reverify_parent_explanation_price(jsonb,text)','execute') then
    raise exception 'Price refresh RPC grants are wrong';
  end if;
  select count(*) into before_spend from public.parent_explanation_spend;
  update public.parent_explanation_prices set enabled=true,approved_metadata=approved,last_checked_at=null,
    verified_at=clock_timestamp()-interval '25 hours',maximum_micros=2500000 where model='anthropic/claude-haiku-5.5';
  result:=public.reverify_parent_explanation_price(approved);
  if result<>'verified' or not exists(select 1 from public.parent_explanation_prices where enabled and verified_at>clock_timestamp()-interval '1 minute') then
    raise exception 'Unchanged approved metadata did not renew: %',result;
  end if;
  if public.reverify_parent_explanation_price(approved)<>'not_due' then raise exception 'Daily check repeated'; end if;
  update public.parent_explanation_prices set last_checked_at=clock_timestamp()-interval '24 hours',verified_at=clock_timestamp()-interval '24 hours'
    where model='anthropic/claude-haiku-5.5' returning verified_at into before_verified;
  result:=public.reverify_parent_explanation_price(approved||'{"price":"changed"}');
  select verified_at into after_verified from public.parent_explanation_prices where model='anthropic/claude-haiku-5.5';
  if result<>'price_metadata_changed' or after_verified<>before_verified
    or exists(select 1 from public.parent_explanation_prices where enabled) then raise exception 'Changed price was accepted'; end if;
  if public.reverify_parent_explanation_price(approved)<>'disabled' then raise exception 'A later sweep reenabled a failed price'; end if;
  update public.parent_explanation_prices set enabled=true,last_checked_at=null where model='anthropic/claude-haiku-5.5';
  result:=public.reverify_parent_explanation_price('null','public_price_read_failed');
  if result<>'public_price_read_failed' or exists(select 1 from public.parent_explanation_prices where enabled) then raise exception 'Read failure did not fail closed'; end if;
  update public.parent_explanation_prices set enabled=true,last_checked_at=null,maximum_micros=2202534 where model='anthropic/claude-haiku-5.5';
  if public.reverify_parent_explanation_price(approved)<>'incompatible_bound' then raise exception 'Insufficient bound renewed'; end if;
  update public.parent_explanation_prices set enabled=true,last_checked_at=null,maximum_micros=2500000,approved_metadata=null where model='anthropic/claude-haiku-5.5';
  if public.reverify_parent_explanation_price(approved)<>'missing_approved_metadata' then raise exception 'Unapproved baseline renewed'; end if;
  if (select count(*) from public.parent_explanation_spend)<>before_spend then raise exception 'Price check created spend'; end if;
end $$;
rollback;
select 'parent explanation price refresh probes passed; all mutations rolled back' as result;
