-- Customer origin mix for the customers-page Sources section.
-- SML.source is captured per sale from 2026-09-16 (values: visit/live/work, and
-- occasional multi like 'work/visit'). This returns cumulative distinct customers
-- by origin to each week-end, per branch + ALL, from the first capture week onward.
-- Merged into public.dash_sales_full as REAL.source. Retention-by-source is NOT
-- derived (no per-customer origin history); the page dashes it.
create or replace function dash.source_block(p_end date, p_n int)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
with params as ( select greatest(1, least(coalesce(p_n,38),52)) as n ),
wk as (   -- week-ends (Sundays); p_end is already a Sunday from dash.weeks()
  select gs::date we from params, generate_series(p_end - 7*(n-1), p_end, interval '7 days') gs
),
tix as (   -- one row per (customer, branch, week-end, category); split multi on '/'
  select distinct
    coalesce(nullif(s.phone,''), s.salesno) as cust,
    s.branch,
    (date_trunc('week', s.date)::date + 6) as we,
    lower(trim(c)) as cat
  from "SML" s, unnest(string_to_array(s.source,'/')) c
  where s.source is not null and lower(trim(c)) in ('visit','live','work')
),
inc as ( select branch, we, cat, count(distinct cust) n from tix group by 1,2,3 ),
first_we as ( select min(we) fwe from tix ),
grid as (
  select b.code as branch, c.cat, w.we
  from (values ('BGC'),('PPM'),('POD'),('LEV'),('EROD')) b(code)
  cross join (values ('visit'),('live'),('work')) c(cat)
  cross join wk w cross join first_we
  where w.we >= first_we.fwe
),
cum as (
  select g.branch, g.cat, g.we,
    coalesce((select sum(i.n) from inc i where i.branch=g.branch and i.cat=g.cat and i.we <= g.we),0) n
  from grid g
),
bykey as ( select branch, we, jsonb_object_agg(cat, n) cats from cum group by branch, we ),
branch_json as ( select branch, jsonb_object_agg(to_char(we,'YYYY-MM-DD'), cats) weeks from bykey group by branch ),
all_cum as ( select cat, we, sum(n) n from cum group by cat, we ),
all_bykey as ( select we, jsonb_object_agg(cat, n) cats from all_cum group by we ),
all_json as ( select jsonb_object_agg(to_char(we,'YYYY-MM-DD'), cats) weeks from all_bykey )
select coalesce((select jsonb_object_agg(branch, weeks) from branch_json), '{}'::jsonb)
     || jsonb_build_object('ALL', coalesce((select weeks from all_json), '{}'::jsonb));
$$;

-- Merge the source block into the sales/customers payload.
create or replace function public.dash_sales_full(p_end date, p_n int)
returns jsonb language sql stable security definer set search_path = public, pg_temp
set statement_timeout='30s' as $$
  select dash.sales_full(p_end, p_n) || jsonb_build_object('source', dash.source_block(p_end, p_n));
$$;
grant execute on function public.dash_sales_full(date, int) to anon, authenticated;
