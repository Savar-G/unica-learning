-- Keep the live command, signature and grants. Change only the claim insert under its existing family and lease locks.
do $migration$
declare
  definition text := pg_get_functiondef('public.scan_marking_automatic_command(text,uuid,uuid,uuid,jsonb)'::regprocedure);
  previous text := 'on conflict(workbook_id,printed_revision,page_id,item_id) do nothing;';
  revised text := $claim$on conflict(workbook_id,printed_revision,page_id,item_id) do update
      set observation=jsonb_set(excluded.observation,'{resultVersion}',to_jsonb(scan_marking_items.result_version+1)),
          result_version=scan_marking_items.result_version+1
      where scan_marking_items.parent_id=p_parent
        and (scan_marking_items.owner_photo is null or scan_marking_items.owner_photo=p_photo)
        and scan_marking_items.observation->>'state'='pending'
        and scan_marking_items.observation->>'certainty'='not-read'
        and scan_marking_items.observation->>'result' is null
        and excluded.observation->>'state'='pending'
        and excluded.observation->>'certainty'='uncertain'
        and excluded.observation->>'issue' in ('covered','alignment','page-fit','cut-off')
        and excluded.observation->'evidence'->>'photoRevision'=p_photo::text;$claim$;
begin
  if strpos(definition, revised)>0 then return; end if;
  if strpos(definition, previous)=0 or
      strpos(substr(definition, strpos(definition, previous)+length(previous)), previous)>0 then
    raise exception 'Expected one unchanged scan marking claim insert';
  end if;
  execute replace(definition, previous, revised);
end
$migration$;
