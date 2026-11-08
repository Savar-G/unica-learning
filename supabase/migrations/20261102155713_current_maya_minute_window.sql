-- Applied to cdjobwsyzndtltzfpyqa through Supabase MCP, registry 20261102160821.
-- #433: Resolve an expired grant's current family window under its child/parent lock.
-- The postal snapshot follows src/lib/canada-postal-zones.ts. The dated rules follow family-time.ts.
-- Keep this internal helper and the TypeScript rules in step when those rules change.
create or replace function public._maya_family_window(p_parent uuid, p_kind text, p_at timestamptz)
returns table (period date, period_start timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_zone text; v_postal text; v_province text; v_wall timestamp;
  v_candidates timestamptz[]; v_low timestamptz; v_high timestamptz; v_mid timestamptz;
  v_postal_zones constant jsonb := '{
  "X0A0V0": "America/Resolute",
  "X0A0A2": "America/Resolute",
  "X0A0G0": "Etc/GMT+6",
  "X0C0C0": "America/Atikokan",
  "X0C0A2": "America/Atikokan",
  "A0K1N0": "America/Goose_Bay",
  "A0K0B5": "America/Goose_Bay",
  "A0K1V0": "America/Goose_Bay",
  "G0C2R0": "America/Halifax",
  "G0G1C0": "America/Blanc-Sablon",
  "G0G1E0": "America/Blanc-Sablon",
  "G0G1G0": "America/Blanc-Sablon",
  "G0G1M0": "America/Blanc-Sablon",
  "G0G1N0": "America/Blanc-Sablon",
  "G0G1S0": "America/Blanc-Sablon",
  "G0G1T0": "America/Blanc-Sablon",
  "G0G1W0": "America/Blanc-Sablon",
  "G0G1Z0": "America/Blanc-Sablon",
  "G0G2C0": "America/Blanc-Sablon",
  "G0G2G0": "America/Blanc-Sablon",
  "G0G2P0": "America/Blanc-Sablon",
  "G0G2R0": "America/Blanc-Sablon",
  "G0G2W0": "America/Blanc-Sablon",
  "G0G0B5": "America/Blanc-Sablon",
  "G0G0C7": "America/Blanc-Sablon",
  "G0G0A6": "America/Blanc-Sablon",
  "G0G0B3": "America/Blanc-Sablon",
  "G0G0A2": "America/Blanc-Sablon",
  "G0G0A3": "America/Blanc-Sablon",
  "G0G0C8": "America/Blanc-Sablon",
  "P0T1C0": "America/Atikokan",
  "P0V3A0": "America/Atikokan",
  "P0V2H0": "America/Atikokan",
  "P0T1T0": "America/Winnipeg",
  "P0V1G0": "America/Chicago",
  "P0V1B0": "America/Chicago",
  "P0V0C2": "America/Chicago",
  "P0V1Y0": "America/Chicago",
  "P0V0A1": "America/Chicago",
  "P0V1Z0": "America/Chicago",
  "P0V2Z0": "America/Chicago",
  "P0V0C4": "America/Chicago",
  "P0V1W0": "America/Toronto",
  "P0V0B8": "America/Toronto",
  "S0P0A0": "America/Winnipeg",
  "S0P0B0": "America/Winnipeg",
  "S0M1H0": "America/Edmonton",
  "S0M1M0": "America/Edmonton",
  "S0M1R0": "America/Edmonton",
  "S0M1P0": "America/Edmonton",
  "S0M2C0": "America/Edmonton",
  "V0C1H0": "America/Dawson_Creek",
  "V0C1J0": "America/Dawson_Creek",
  "V0C1V0": "America/Dawson_Creek",
  "V0C1X0": "America/Dawson_Creek",
  "V0C2C0": "America/Dawson_Creek",
  "V0C2K0": "America/Dawson_Creek",
  "V0C2L0": "America/Dawson_Creek",
  "V0C2W0": "America/Dawson_Creek",
  "V0C1R0": "America/Fort_Nelson",
  "V0C1L0": "America/Vancouver",
  "V0B1E0": "America/Creston",
  "V0B1S0": "America/Creston",
  "V0B1X0": "America/Creston",
  "V0B2B0": "America/Creston",
  "V0B1A1": "America/Creston",
  "V0B1A2": "America/Creston",
  "V0B1A3": "America/Creston",
  "V0B1A4": "America/Creston",
  "V0B1C1": "America/Creston",
  "V0B1V0": "America/Creston",
  "V0B1V1": "America/Creston",
  "V0B1W1": "America/Creston",
  "V0B2N1": "America/Creston",
  "V0B2N2": "America/Creston",
  "V0B1A0": "America/Creston",
  "V0B1C0": "America/Creston",
  "V0B1G0": "America/Creston",
  "V0B1G2": "America/Creston",
  "V0B1G3": "America/Creston",
  "V0B1G4": "America/Creston",
  "V0B1G5": "America/Creston",
  "V0B1G6": "America/Creston",
  "V0B1G7": "America/Creston",
  "V0B1G8": "America/Creston",
  "V0B1K0": "America/Creston",
  "V0B1W0": "America/Creston",
  "V0B2C0": "America/Creston",
  "V0B2N0": "America/Creston",
  "V0B2P0": "America/Creston",
  "V0B1G1": "America/Creston",
  "V0B1G9": "America/Creston",
  "A0P": "America/Goose_Bay",
  "A0R": "America/Goose_Bay",
  "A2V": "America/Goose_Bay",
  "G4T": "America/Halifax",
  "P0V": "America/Winnipeg",
  "P0W": "America/Winnipeg",
  "P0X": "America/Winnipeg",
  "P0Y": "America/Winnipeg",
  "P8N": "America/Winnipeg",
  "P8T": "America/Winnipeg",
  "P9A": "America/Winnipeg",
  "P9N": "America/Winnipeg",
  "S9V": "America/Edmonton",
  "V0A": "America/Edmonton",
  "V0B": "America/Edmonton",
  "V1A": "America/Edmonton",
  "V1C": "America/Edmonton",
  "V0C": "America/Dawson_Creek",
  "V1G": "America/Dawson_Creek",
  "V1J": "America/Dawson_Creek",
  "X0A": "America/Iqaluit",
  "X0B": "America/Cambridge_Bay",
  "X0C": "America/Rankin_Inlet",
  "X0E": "America/Inuvik",
  "A": "America/St_Johns",
  "B": "America/Halifax",
  "C": "America/Halifax",
  "E": "America/Moncton",
  "G": "America/Toronto",
  "H": "America/Toronto",
  "J": "America/Toronto",
  "K": "America/Toronto",
  "L": "America/Toronto",
  "M": "America/Toronto",
  "N": "America/Toronto",
  "P": "America/Toronto",
  "R": "America/Winnipeg",
  "S": "America/Regina",
  "T": "America/Edmonton",
  "V": "America/Vancouver",
  "X": "America/Yellowknife",
  "Y": "America/Whitehorse"
}'::jsonb;
  v_province_zones constant jsonb := '{"NL":"America/St_Johns","NS":"America/Halifax","PE":"America/Halifax","NB":"America/Moncton","QC":"America/Toronto","ON":"America/Toronto","MB":"America/Winnipeg","SK":"America/Regina","AB":"America/Edmonton","BC":"America/Vancouver","NT":"America/Yellowknife","NU":"America/Iqaluit","YT":"America/Whitehorse"}'::jsonb;
begin
  select p.time_zone, regexp_replace(upper(coalesce(p.postal, '')), '[[:space:]]', '', 'g')
    into v_zone, v_postal from public.parents p where p.id = p_parent for share;
  if not found then raise exception 'maya_minute_family_missing' using errcode = '55000'; end if;
  if v_zone is null or not exists (select 1 from pg_timezone_names where name = v_zone) then
    v_zone := null;
    if v_postal ~ '^[ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTVWXYZ][0-9][ABCEGHJ-NPRSTVWXYZ][0-9]$' then
      v_zone := coalesce(v_postal_zones->>v_postal, v_postal_zones->>left(v_postal, 3), v_postal_zones->>left(v_postal, 1));
    end if;
    if v_zone is null then
      select c.province into v_province from public.children c where c.parent_id = p_parent order by c.created_at, c.id limit 1 for share;
      v_zone := coalesce(v_province_zones->>v_province, 'America/Vancouver');
    end if;
  end if;
  -- Apply the same confirmed offsets even when the database's tzdata is older.
  v_zone := case
    when v_zone in ('America/Vancouver', 'Canada/Pacific') and p_at >= '2026-03-08T10:00Z' then 'Etc/GMT+7'
    when v_zone in ('America/Edmonton', 'Canada/Mountain', 'America/Yellowknife', 'America/Inuvik') and p_at >= '2026-11-01T08:00Z' then 'Etc/GMT+6'
    when v_zone in ('America/Winnipeg', 'Canada/Central') and p_at >= '2026-11-01T07:00Z' then 'Etc/GMT+5'
    else v_zone end;
  period := (p_at at time zone v_zone)::date;
  if p_kind = 'child' then period := period - (extract(isodow from period)::integer - 1); end if;
  v_wall := period::timestamp;
  -- Try both offsets around midnight. Choose the first occurrence of a repeated midnight.
  select array_agg(distinct (v_wall - ((s at time zone v_zone) - (s at time zone 'UTC'))) at time zone 'UTC')
    into v_candidates from unnest(array[p_at - interval '2 days', p_at, p_at + interval '2 days']) s;
  select min(c) into period_start from unnest(v_candidates) c where c at time zone v_zone = v_wall;
  if period_start is null then
    -- A midnight in a forward gap starts at the transition, as localDateTime does.
    select min(c), max(c) into v_low, v_high from unnest(v_candidates) c;
    while v_high - v_low > interval '1 millisecond' loop
      v_mid := v_low + (v_high - v_low) / 2;
      if v_mid at time zone v_zone >= v_wall then v_high := v_mid; else v_low := v_mid; end if;
    end loop;
    period_start := date_trunc('milliseconds', v_high + interval '0.999 milliseconds');
  end if;
  return next;
end $$;
revoke all on function public._maya_family_window(uuid, text, timestamptz) from public, anon, authenticated, service_role;

create or replace function public.reserve_maya_minutes_on_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.maya_minute_grants; v_seconds integer; v_period date; v_start timestamptz;
begin
  select * into g from public.maya_minute_grants where call_id = new.id;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('maya_minutes:' || g.kind || ':' || coalesce(g.child_id, g.parent_id)::text, 0));
  -- Re-read after waiting: a competing retry may have refreshed or settled this grant.
  select * into g from public.maya_minute_grants where call_id = new.id;
  if not found or g.parent_id is distinct from new.parent_id or (g.kind = 'child' and g.child_id is distinct from new.child_id)
    or g.used_seconds is not null then
    raise exception 'maya_minute_grant_mismatch' using errcode = '55000';
  end if;
  if g.created_at <= clock_timestamp() - interval '2 minutes' then
    select w.period, w.period_start into v_period, v_start from public._maya_family_window(g.parent_id, g.kind, clock_timestamp()) w;
    select granted into v_seconds from public.grant_maya_minutes(g.call_id, g.parent_id, g.child_id, g.kind, v_period,
      case when g.kind = 'child' then 1800 else 120 end, g.granted_seconds, g.granted_seconds, v_start);
    if v_seconds is distinct from g.granted_seconds then
      raise exception 'maya_minute_grant_expired' using errcode = '55000';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.reserve_maya_minutes_on_call() from public, anon, authenticated, service_role;
