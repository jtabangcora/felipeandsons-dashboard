-- New-to-branch cohort, checked at every month end.
-- Of each month's brand-new-to-branch customers, how many have come back (any later
-- attended, phone-identified YBE visit at that branch) by each month end from M onward.
--   * the M+2 month end is the cohort score (same figure as dash.mv_cohort)
--   * the latest month end is the lifetime check
-- Not yet applied: run in the Supabase SQL editor (project xrzxbsexasfgrxolymvl).
-- The Sales page reads REAL.cohort.life when present and dashes the lifetime line until then.

create materialized view dash.mv_cohort_life as
with att as (
  select branch, phone, date from "YBE"
  where status in ('Finished','Checked-in','Pending') and phone is not null
  group by branch, phone, date
),
c as (select branch, phone, min(date) fd from att group by branch, phone having min(date) >= date '2026-01-01'),
r as (
  select c.branch, c.phone, c.fd, min(a.date) filter (where a.date > c.fd) fr
  from c join att a on a.branch = c.branch and a.phone = c.phone
  group by c.branch, c.phone, c.fd
),
me as (
  select (gs + interval '1 month' - interval '1 day')::date me
  from generate_series(date '2026-01-01', date '2026-12-01', interval '1 month') gs
)
select r.branch,
  to_char(date_trunc('month', r.fd), 'YYYY-MM') cmonth,
  me.me month_end,
  count(*)::int c_cnt,
  count(*) filter (where r.fr <= me.me)::int r_cnt
from r
join me on me.me >= (date_trunc('month', r.fd) + interval '1 month' - interval '1 day')::date
group by r.branch, 2, me.me;

create index mv_cohort_life_idx on dash.mv_cohort_life(branch, cmonth, month_end);
grant select on dash.mv_cohort_life to anon, authenticated;

create or replace function dash.refresh_all()
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  refresh materialized view dash.mv_lifetime;
  refresh materialized view dash.mv_bvis;
  refresh materialized view dash.mv_team;
  refresh materialized view dash.mv_cohort;
  refresh materialized view dash.mv_cohort_life;
end $$;

-- cohort_block gains:
--   life         { node: { cohortMonth: { 'YYYY-MM-DD' month end: returned } } }
--                month ends up to the one containing lifeThrough
--   lifeThrough  the last YBE date loaded, so the current month's column reads "to date"
create or replace function dash.cohort_block()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
with dt as ( select (select max(date) from public."DOR" where channel='BGC') as data_through,
                    (select max(date) from public."YBE") as ybe_through ),
mat as (
  select to_char(max(m), 'YYYY-MM') as mature_through
  from ( select distinct to_date(cmonth,'YYYY-MM') m from dash.mv_cohort ) x, dt
  where (date_trunc('month', x.m) + interval '3 months' - interval '1 day')::date <= dt.data_through
),
months as ( select distinct cmonth from dash.mv_cohort order by cmonth ),
branch_rows as (
  select branch, jsonb_object_agg(cmonth, jsonb_build_object('c', c_cnt, 'r', r_cnt)) as obj
  from dash.mv_cohort group by branch
),
all_row as (
  select jsonb_object_agg(cmonth, jsonb_build_object('c', c_cnt, 'r', r_cnt)) as obj
  from ( select cmonth, sum(c_cnt)::int c_cnt, sum(r_cnt)::int r_cnt from dash.mv_cohort group by cmonth ) a
),
lf as (
  select l.branch node, l.cmonth, l.month_end, l.r_cnt
  from dash.mv_cohort_life l, dt
  where l.month_end <= (date_trunc('month', dt.ybe_through) + interval '1 month' - interval '1 day')::date
  union all
  select 'ALL', l.cmonth, l.month_end, sum(l.r_cnt)::int
  from dash.mv_cohort_life l, dt
  where l.month_end <= (date_trunc('month', dt.ybe_through) + interval '1 month' - interval '1 day')::date
  group by l.cmonth, l.month_end
),
lf_c as ( select node, cmonth, jsonb_object_agg(to_char(month_end,'YYYY-MM-DD'), r_cnt) o from lf group by node, cmonth ),
lf_n as ( select node, jsonb_object_agg(cmonth, o) o from lf_c group by node )
select jsonb_build_object(
  'months', coalesce((select jsonb_agg(cmonth order by cmonth) from months), '[]'::jsonb),
  'matureThrough', (select mature_through from mat),
  'rows', coalesce((select jsonb_object_agg(branch, obj) from branch_rows), '{}'::jsonb)
            || jsonb_build_object('ALL', coalesce((select obj from all_row), '{}'::jsonb)),
  'life', coalesce((select jsonb_object_agg(node, o) from lf_n), '{}'::jsonb),
  'lifeThrough', (select to_char(ybe_through,'YYYY-MM-DD') from dt)
);
$function$;
