-- =====================================================================
-- dash.team_full(p_end date, p_n int) -> jsonb
-- Reproduces the DATA object baked into the F&S STAFF dashboard page.
-- Keys: roster, bma, ret, consw, hire, foh
--
-- All windows are anchored to the frozen 2026 calendar the page hard-codes
-- (WEEKS from 2026-01-04; lifetime month-ends Jan..Aug + "as at 6 Sep";
-- new-client cohort months 01..06; consistency weeks w/e Aug 9..Sep 6).
-- p_end / p_n are accepted for signature parity with the other dash.*
-- functions but do NOT move those fixed anchors.
--
-- PERFORMANCE: the per-barber retention + consistency blocks aggregate over
-- ~314k YBE rows and ~62k SML rows via the fuzzy name map; done inline this
-- blows the anon PostgREST 3s timeout. They are precomputed into two
-- materialized views (dash.mv_bvis -> dash.mv_team) and the function just
-- reads mv_team. Refresh after each data load, in order:
--   refresh materialized view dash.mv_bvis;
--   refresh materialized view dash.mv_team;
--
-- DATA GAP: bma (Barber Master Assessment old-rubric A1/A2 scores) has NO
-- live source. barbersportal_assessments holds only 2 TRADE_TEST rows and
-- zero BMA rows; the page itself labels these scores "old rubric". bma is
-- returned as null and flagged.
--
-- Browser call:
--   POST https://xrzxbsexasfgrxolymvl.supabase.co/rest/v1/rpc/dash_team_full
--   headers: apikey: <publishable key>, Content-Type: application/json
--   body:    {"p_end":"2026-09-06","p_n":36}
-- =====================================================================

create schema if not exists dash;

-- ---------------------------------------------------------------------
-- Base: booking-level capture rows (one per qualifying YBE booking),
-- mapped from the messy YBE "provider" to the canonical roster name via
-- vw_barber_name_map, restricted to current roster barbers.
-- "returning" is counted on BOOKING ROWS (same-day repeat counts), which is
-- what the frozen oracle used -- not distinct dates.
-- ---------------------------------------------------------------------
drop materialized view if exists dash.mv_team cascade;
drop materialized view if exists dash.mv_bvis cascade;

create materialized view dash.mv_bvis as
select nm.canonical_name cn, y.phone, y.date
from "YBE" y
join vw_barber_name_map nm on nm.raw_key = lower(y.provider)
join staff s on s.name = nm.canonical_name
  and s.branch in ('BGC','PPM','POD','LEV','EROD')
  and s.role_group in ('barber','head','roving')
where y.status in ('Finished','Checked-in','Pending') and y.phone is not null;
create index mv_bvis_cn_phone on dash.mv_bvis(cn, phone);
create index mv_bvis_cn_date  on dash.mv_bvis(cn, date);

-- ---------------------------------------------------------------------
-- Per-barber ret + consw JSON fragments.
-- ---------------------------------------------------------------------
create materialized view dash.mv_team as
with roster as (
  select s.name, s.branch, s.is_roving,
    (select lapse_threshold_days from branch_retention_params p
      where p.branch = s.branch and p.quarter_start = date '2026-07-01') lapse
  from staff s
  where s.branch in ('BGC','PPM','POD','LEV','EROD')
    and s.role_group in ('barber','head','roving')
),
per as (   -- per (barber, phone): 1st and 2nd BOOKING dates (dups kept)
  select cn, phone, min(date) d1, (array_agg(date order by date))[2] d2
  from dash.mv_bvis group by cn, phone
),
asat(idx, ae) as (values
  (0,date '2026-01-31'),(1,date '2026-02-28'),(2,date '2026-03-31'),
  (3,date '2026-04-30'),(4,date '2026-05-31'),(5,date '2026-06-30'),
  (6,date '2026-07-31'),(7,date '2026-08-31'),(8,date '2026-09-06')),
life as (   -- l = share of clients with >=2 bookings; lc = distinct clients
  select r.name, a.idx,
    count(p.phone) filter (where p.d1 <= a.ae) clients,
    count(p.phone) filter (where p.d2 is not null and p.d2 <= a.ae) ret
  from roster r cross join asat a
  left join per p on p.cn = r.name
  group by r.name, a.idx
),
life_arr as (
  select name,
    jsonb_agg(case when clients > 0 then round(100.0*ret/clients,1) end order by idx) l,
    jsonb_agg(clients order by idx) lc,
    max(clients) maxc
  from life group by name
),
cohort as (   -- new-client cohort by first-booking month (01..06)
  select r.name, to_char(p.d1,'MM') mo, p.phone, p.d1 fd, r.lapse
  from roster r join per p on p.cn = r.name
  where p.d1 >= date '2026-01-01' and p.d1 < date '2026-07-01'
),
coh as (      -- returned within the barber's home-branch lapse window
  select c.name, c.mo, count(*) total,
    count(*) filter (where exists(
      select 1 from dash.mv_bvis x where x.cn = c.name and x.phone = c.phone
        and x.date > c.fd and x.date <= c.fd + c.lapse)) ret
  from cohort c group by c.name, c.mo
),
coh_obj as (
  select name, jsonb_object_agg(mo, jsonb_build_array(total, ret,
    round(100.0*ret/nullif(total,0),1))) c
  from coh group by name
),
-- consw.g : weekly review count; null in weeks with no SML/YBE activity
actw as (
  select cn, wi, count(*) n from (
    select nm.canonical_name cn, floor((sl.date - date '2026-01-05')/7.0)::int + 1 wi
    from "SML" sl join vw_barber_name_map nm on nm.raw_key = lower(sl.barber)
    union all
    select cn, floor((date - date '2026-01-05')/7.0)::int + 1 wi from dash.mv_bvis
  ) z group by cn, wi
),
rev as (
  select r.name, floor((rv.review_date - date '2026-01-05')/7.0)::int + 1 wi
  from roster r
  join reviews rv on rv.staff_mentioned is not null and rv.staff_mentioned <> 'none'
    and rv.staff_mentioned ilike '%'||r.name||'%'
  where rv.review_date <= date '2026-09-06'
),
rev_wk as (select name, wi, count(*) c from rev where wi between 0 and 35 group by name, wi),
g_arr as (
  select r.name,
    jsonb_agg(case when aw.n is null then null else coalesce(rw.c,0) end order by w.i) g
  from roster r
  cross join generate_series(0,35) w(i)
  left join actw   aw on aw.cn = r.name and aw.wi = w.i
  left join rev_wk rw on rw.name = r.name and rw.wi = w.i
  group by r.name
),
-- consw.c : 5 consistency weeks. peso = round(net_sml / ft_ybe);
-- arpu_score = round(min(10, (net/ft)/wtgt*10),2) with wtgt = ft-weighted
-- branch ARPU target (BGC 1000, PPM 950, POD 920, LEV 960, EROD 900), which
-- reduces to the branch target for non-roving barbers; retail_pct =
-- retail_tickets/ft_ybe*100, retail_conv = round(min(10,retail_pct/12*10),2).
-- retail is null for POD and roving barbers (not credited to the barber).
cw(j, we) as (values
  (0,date '2026-08-09'),(1,date '2026-08-16'),(2,date '2026-08-23'),
  (3,date '2026-08-30'),(4,date '2026-09-06')),
vwb as (
  select v.barber cn, v.week_end,
    sum(v.net_sales_sml) net, sum(v.ft_total_ybe) ftybe,
    sum(v.ft_total_ybe * (case v.branch when 'BGC' then 1000 when 'PPM' then 950
        when 'POD' then 920 when 'LEV' then 960 when 'EROD' then 900 end))::numeric
      / nullif(sum(v.ft_total_ybe),0) wtgt
  from vw_weekly_barber v
  where v.week_end in ('2026-08-09','2026-08-16','2026-08-23','2026-08-30','2026-09-06')
  group by v.barber, v.week_end
),
rtk as (
  select nm.canonical_name cn, (date_trunc('week', sl.date)::date + 6) we,
    count(distinct sl.salesno) filter (where sl.category = 'RETAIL') tickets
  from "SML" sl join vw_barber_name_map nm on nm.raw_key = lower(sl.barber)
  where sl.date between '2026-08-03' and '2026-09-06'
  group by nm.canonical_name, (date_trunc('week', sl.date)::date + 6)
),
c_rows as (
  select r.name, r.branch, r.is_roving, cw.j, w.net, w.ftybe, w.wtgt,
    coalesce(k.tickets,0) tickets
  from roster r cross join cw
  left join vwb w on w.cn = r.name and w.week_end = cw.we
  left join rtk k on k.cn = r.name and k.we = cw.we
),
c_tup as (
  select name, j,
    case when net is null or ftybe is null or ftybe = 0 then jsonb_build_array(null,null,null,null)
    else jsonb_build_array(
      round(least(10, (net/ftybe)/wtgt*10)::numeric, 2),
      round(net/ftybe),
      case when branch='POD' or is_roving then null
           else round(least(10, (tickets::numeric/ftybe*100)/12*10), 2) end,
      case when branch='POD' or is_roving then null
           else round(tickets::numeric/ftybe*100, 1) end)
    end tup
  from c_rows
),
c_arr as (select name, jsonb_agg(tup order by j) c from c_tup group by name)
select r.name,
  case when la.maxc > 0
    then jsonb_build_object('l', la.l, 'lc', la.lc, 'c', co.c) else null end ret,
  jsonb_build_object('g', g.g, 'c', ca.c) consw
from roster r
left join life_arr la on la.name = r.name
left join coh_obj  co on co.name = r.name
left join g_arr    g  on g.name  = r.name
left join c_arr    ca on ca.name = r.name;

create unique index mv_team_name on dash.mv_team(name);
grant select on dash.mv_team to anon, authenticated;

-- ---------------------------------------------------------------------
-- Main function: cheap roster/foh/hire inline + read the MV for ret/consw.
-- ---------------------------------------------------------------------
create or replace function dash.team_full(p_end date, p_n int)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp set statement_timeout='30s' as $$
declare
  result jsonb;
  j_roster jsonb; j_foh jsonb; j_hire jsonb; j_ret jsonb; j_consw jsonb;
begin
  -- roster = [branch, name, tag]  (barbers only; tag roving|head|'')
  select jsonb_agg(jsonb_build_array(branch, name, tag) order by bsort, name)
  into j_roster
  from (
    select s.branch, s.name,
      case when s.is_roving then 'roving' when s.is_head_barber then 'head' else '' end tag,
      case s.branch when 'BGC' then 1 when 'PPM' then 2 when 'POD' then 3
           when 'LEV' then 4 when 'EROD' then 5 end bsort
    from staff s
    where s.branch in ('BGC','PPM','POD','LEV','EROD')
      and s.role_group in ('barber','head','roving')
  ) r;

  -- foh = [name, branch, role]  (Front of House -> 'FOH', else role text)
  select jsonb_agg(jsonb_build_array(name, branch, disp_role) order by bsort, name)
  into j_foh
  from (
    select s.name, s.branch,
      case when s.role='Front of House' then 'FOH' else s.role end disp_role,
      case s.branch when 'BGC' then 1 when 'PPM' then 2 when 'POD' then 3
           when 'LEV' then 4 when 'EROD' then 5 end bsort
    from staff s
    where s.branch in ('BGC','PPM','POD','LEV','EROD')
      and s.role in ('Front of House','Manager')
  ) f;

  -- hire = [role_code, role_name (branch prefix stripped), branch, fill_by]
  select jsonb_agg(jsonb_build_array(role_code, stripped, branch,
           to_char(fill_by,'YYYY-MM-DD'))
           order by fill_by nulls last, branch_sort, type_sort, seat_no)
  into j_hire
  from (
    select role_code,
      regexp_replace(role_name,'^(TRN|HO|BGC|PPM|POD|LEV|EROD) ','') stripped,
      branch, fill_by, branch_sort, type_sort, seat_no
    from v_for_hire
  ) h;

  -- ret keyed only for barbers with visit history; consw keyed for all
  select jsonb_object_agg(name, ret) filter (where ret is not null),
         jsonb_object_agg(name, consw)
  into j_ret, j_consw from dash.mv_team;

  result := jsonb_build_object(
    'roster', j_roster,
    'bma', null,          -- DATA GAP: no BMA rows exist in the DB
    'ret', j_ret,
    'consw', j_consw,
    'hire', j_hire,
    'foh', j_foh
  );
  return result;
end $$;

create or replace function public.dash_team_full(p_end date, p_n int)
returns jsonb language sql stable security definer
set search_path = public, pg_temp set statement_timeout='30s' as $$
  select dash.team_full(p_end, p_n);
$$;

grant usage on schema dash to anon, authenticated;
grant select on dash.mv_bvis, dash.mv_team to anon, authenticated;
grant execute on function dash.team_full(date, int) to anon, authenticated;
grant execute on function public.dash_team_full(date, int) to anon, authenticated;
