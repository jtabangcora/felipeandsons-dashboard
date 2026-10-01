-- FOH contact capture (applied as migration dash_foh_capture_v1).
-- For every day an FOH is on duty (DOR foh_on_duty, resolved to a roster name by vw_dor_foh),
-- that branch-day's capture rate = attended Yodel visits with a phone ÷ attended visits.
-- Weekly score = average of those daily rates, Monday to Sunday, keyed by the Sunday.
-- Returns { foh_name: { 'YYYY-MM-DD' (week end): [avg_daily_pct, days_on_duty] } }
create or replace function public.dash_foh_capture()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
set statement_timeout to '20s' as $$
with d as (
  select branch, date, count(*) served, count(*) filter (where phone is not null) cap
  from "YBE"
  where status in ('Finished','Checked-in','Pending') and date >= date '2026-01-01'
  group by branch, date
),
f as (
  select distinct channel, date, foh_name from vw_dor_foh
  where foh_name is not null and date >= date '2026-01-01'
),
w as (
  select f.foh_name, (date_trunc('week', f.date)::date + 6) we,
         round(100 * avg(d.cap::numeric / d.served), 1) pct, count(*)::int days
  from f join d on d.branch = f.channel and d.date = f.date and d.served > 0
  group by 1, 2
),
p as (select foh_name, jsonb_object_agg(to_char(we,'YYYY-MM-DD'), jsonb_build_array(pct, days)) o from w group by foh_name)
select coalesce(jsonb_object_agg(foh_name, o), '{}'::jsonb) from p;
$$;
grant execute on function public.dash_foh_capture() to anon, authenticated;
