-- =====================================================================
-- dash.sales_full(p_end date, p_n int) -> jsonb
-- Reproduces the REAL object baked into the F&S sales dashboard page,
-- so the page can fetch it live. SECURITY DEFINER, stable.
--
-- Deployed to Supabase project xrzxbsexasfgrxolymvl as migrations:
--   dash_mv_lifetime_v2   (the precomputed lifetime materialized view)
--   dash_sales_full_v4    (this function)
--   + public.dash_sales_full wrapper and grants
--
-- Call from the browser:
--   POST https://xrzxbsexasfgrxolymvl.supabase.co/rest/v1/rpc/dash_sales_full
--   headers: apikey: <publishable key>, Content-Type: application/json
--   body:    {"p_end":"2026-09-20","p_n":38}
--
-- NOTE ON LIFETIME PERFORMANCE:
-- The lifetime block requires per-customer aggregation over ~314k YBE rows
-- for every week-end. Doing it inline blows the anon 3s statement_timeout,
-- so it is precomputed into dash.mv_lifetime (2026-01-04 .. 2026-12-27) and
-- read by the function. Refresh it after each data load:
--   refresh materialized view dash.mv_lifetime;
-- =====================================================================

create schema if not exists dash;

-- ---------------------------------------------------------------------
-- Precomputed lifetime block, keyed by week-end and node (branch or ALL).
-- Tuple = [customers, ret>=2 visits, ret>=3, ret>=4, active, lapsed, lapse_days].
--   * per-branch "visits" = distinct dates at that branch
--   * ALL "visits"        = distinct (branch,date) pairs, phone counted once
--   * active  = last visit as of the week-end is within `lapse` days
--   * lapsed  = last visit is older than `lapse` but within 365 days
--   * active/lapsed/lapse are NULL when the week's quarter has no
--     branch_retention_params row (matches the oracle: null before Q3 2026)
--   * ALL uses the phone's last-visit branch's lapse threshold
-- ---------------------------------------------------------------------
drop materialized view if exists dash.mv_lifetime;
create materialized view dash.mv_lifetime as
with wk as (
  select gs::date we from generate_series(date '2026-01-04', date '2026-12-27', interval '7 days') gs
),
dv as (  -- distinct capture visits per branch
  select branch, phone, date from "YBE"
  where status in ('Finished','Checked-in','Pending') and phone is not null
  group by branch, phone, date
),
lp as (
  select branch, quarter_start, lapse_threshold_days lapse from branch_retention_params
),
wk_lp as (  -- lapse applicable to a week = the param whose quarter contains it
  select w.we, l.branch, l.lapse
  from wk w join lp l on l.quarter_start = date_trunc('quarter', w.we)::date
),
wk_has_lp as (
  select w.we, exists(select 1 from lp l where l.quarter_start = date_trunc('quarter', w.we)::date) has_lp
  from wk w
),
cust as (  -- per-branch milestone dates (1st..4th distinct visit)
  select branch, phone,
    min(date) filter (where drk=1) d1,
    min(date) filter (where drk=2) d2,
    min(date) filter (where drk=3) d3,
    min(date) filter (where drk=4) d4
  from (select branch, phone, date, dense_rank() over (partition by branch, phone order by date) drk from dv) z
  group by branch, phone
),
tiers_branch as (
  select w.we, c.branch,
    count(*) filter (where c.d1<=w.we) c0,
    count(*) filter (where c.d2<=w.we) c1,
    count(*) filter (where c.d3<=w.we) c2,
    count(*) filter (where c.d4<=w.we) c3
  from cust c join wk w on w.we >= c.d1
  group by w.we, c.branch
),
al_branch as (  -- lapsed = seen-in-365 minus active
  select w.we, dv.branch,
    count(distinct dv.phone) filter (where dv.date >= w.we - wl.lapse) active,
    count(distinct dv.phone) seen365
  from wk w
  join wk_lp wl on wl.we = w.we
  join dv on dv.branch = wl.branch and dv.date <= w.we and dv.date >= w.we-365
  group by w.we, dv.branch
),
branch_tup as (
  select t.we, t.branch,
    jsonb_build_array(t.c0, t.c1, t.c2, t.c3,
      case when wl.lapse is not null then coalesce(a.active,0) end,
      case when wl.lapse is not null then coalesce(a.seen365,0) - coalesce(a.active,0) end,
      wl.lapse) tup
  from tiers_branch t
  left join al_branch a on a.we=t.we and a.branch=t.branch
  left join wk_lp wl on wl.we=t.we and wl.branch=t.branch
),
cust_all as (  -- company distinct phone; tiers by distinct (branch,date)
  select phone,
    min(date) filter (where rk=1) d1,
    min(date) filter (where rk=2) d2,
    min(date) filter (where rk=3) d3,
    min(date) filter (where rk=4) d4
  from (select phone, date, dense_rank() over (partition by phone order by date, branch) rk from dv) z
  group by phone
),
tiers_all as (
  select w.we,
    count(*) filter (where c.d1<=w.we) c0,
    count(*) filter (where c.d2<=w.we) c1,
    count(*) filter (where c.d3<=w.we) c2,
    count(*) filter (where c.d4<=w.we) c3
  from cust_all c join wk w on w.we >= c.d1
  group by w.we
),
al_all as (  -- active/lapsed using each phone's last-visit branch lapse
  select w.we,
    count(*) filter (where lastd >= w.we - homelapse) active,
    count(*) filter (where lastd >= w.we - 365) seen365
  from wk w
  join lateral (
    select p.phone, p.lastd,
      (select l.lapse from lp l where l.branch = p.homebranch and l.quarter_start = date_trunc('quarter', w.we)::date) homelapse
    from (
      select phone, max(date) lastd,
        (array_agg(branch order by date desc, branch))[1] homebranch
      from dv where date <= w.we group by phone
    ) p
  ) x on true
  group by w.we
),
all_tup as (
  select t.we, 'ALL' branch,
    jsonb_build_array(t.c0,t.c1,t.c2,t.c3,
      case when h.has_lp then coalesce(a.active,0) end,
      case when h.has_lp then coalesce(a.seen365,0)-coalesce(a.active,0) end,
      null) tup
  from tiers_all t
  left join al_all a on a.we=t.we
  join wk_has_lp h on h.we=t.we
)
select we, branch node, tup from branch_tup
union all
select we, branch node, tup from all_tup;

create index mv_lifetime_we on dash.mv_lifetime(we);

-- ---------------------------------------------------------------------
-- The main function.
-- ---------------------------------------------------------------------
create or replace function dash.sales_full(p_end date, p_n int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
set statement_timeout='30s' as $$
declare
  n int := greatest(1, coalesce(p_n, 38));
  w_first date := p_end - 6 - 7 * (n - 1);   -- Monday of week 1
  result jsonb;
  j_branch jsonb; j_branch_daily jsonb; j_ybe jsonb; j_ecom jsonb; j_ecom_daily jsonb;
  j_barbers jsonb; j_barcov jsonb; j_ybebar jsonb; j_life jsonb; j_pull jsonb;
  j_weeks jsonb; j_days jsonb;
begin
  perform set_config('work_mem','256MB', true);

  select jsonb_agg(to_char(gs::date,'YYYY-MM-DD') order by gs)
    into j_weeks from generate_series(w_first+6, p_end, interval '7 days') gs;
  select jsonb_agg(to_char(gs::date,'YYYY-MM-DD') order by gs)
    into j_days from generate_series(w_first, p_end, interval '1 day') gs;

  -- ===== BRANCH weekly + daily (single DOR scan) =====
  --   week counts only if all 7 days present; a total is null if any part null;
  --   chairdays over OPEN days only (BGC chairs forced to 12);
  --   availdays/scheddays over all present days (closed day = 0).
  with dor_day as (
    select d.channel, d.date, date_trunc('week', d.date)::date ws,
      d.is_open, d.net_barber, d.net_retail, d.traffic_barber, d.traffic_retail,
      d.walkins_served, d.bookings_served, d.turn_downs,
      d.barbers_available, d.barbers_scheduled,
      case when d.channel='BGC' then 12 else d.chairs end chairs
    from "DOR" d
    where d.channel in ('BGC','EROD','LEV','POD','PPM') and d.date between w_first and p_end
  ),
  br as (select * from (values ('BGC'),('EROD'),('LEV'),('POD'),('PPM')) v(code)),
  wk as (select gs::date we, ((gs::date)-w_first)/7+1 wi from generate_series(w_first+6,p_end,interval '7 days') gs),
  dy as (select gs::date d, (gs::date-w_first) di from generate_series(w_first,p_end,interval '1 day') gs),
  branch_wk as (
    select ws, channel, count(*) days, count(*) filter (where is_open) days_open,
      case when count(*)=7 and count(*) filter (where net_barber is null)=0 then round(sum(net_barber),2) end sales,
      case when count(*)=7 and count(*) filter (where net_retail is null)=0 then round(sum(net_retail),2) end retail,
      case when count(*)=7 and count(*) filter (where traffic_barber is null)=0 then sum(traffic_barber) end clients,
      case when count(*)=7 and count(*) filter (where traffic_retail is null)=0 then sum(traffic_retail) end buyers,
      case when count(*)=7 and count(*) filter (where walkins_served is null)=0 then sum(walkins_served) end walkin,
      case when count(*)=7 and count(*) filter (where bookings_served is null)=0 then sum(bookings_served) end booked,
      case when count(*)=7 and count(*) filter (where turn_downs is null)=0 then sum(turn_downs) end turned,
      case when count(*)=7 and count(*) filter (where barbers_available is null)=0 then sum(barbers_available) end availdays,
      case when count(*)=7 and count(*) filter (where barbers_scheduled is null)=0 then sum(barbers_scheduled) end scheddays,
      case when count(*)=7 and count(*) filter (where is_open and chairs is null)=0 then sum(chairs) filter (where is_open) end chairdays
    from dor_day group by ws, channel
  )
  select jsonb_object_agg(code, obj), jsonb_object_agg(code, dobj)
  into j_branch, j_branch_daily
  from (
    select b.code,
      (select jsonb_build_object(
        'sales', jsonb_agg(bw.sales order by wk.wi),'retail',jsonb_agg(bw.retail order by wk.wi),
        'clients',jsonb_agg(bw.clients order by wk.wi),'buyers',jsonb_agg(bw.buyers order by wk.wi),
        'walkin',jsonb_agg(bw.walkin order by wk.wi),'booked',jsonb_agg(bw.booked order by wk.wi),
        'turned',jsonb_agg(bw.turned order by wk.wi),'availdays',jsonb_agg(bw.availdays order by wk.wi),
        'scheddays',jsonb_agg(bw.scheddays order by wk.wi),'chairdays',jsonb_agg(bw.chairdays order by wk.wi),
        'daysOpen',jsonb_agg(bw.days_open order by wk.wi),'daysReported',jsonb_agg(bw.days order by wk.wi))
       from wk left join branch_wk bw on bw.channel=b.code and bw.ws=(wk.we-6)) obj,
      (select jsonb_build_object(
        'retail', jsonb_agg(dd.net_retail order by dy.di),'sales', jsonb_agg(dd.net_barber order by dy.di))
       from dy left join dor_day dd on dd.channel=b.code and dd.date=dy.d) dobj
    from br b
  ) q;

  -- ===== ECOM weekly + daily (DOR channels LZD/SHP/TKT -> LAZADA/SHOPEE/TIKTOK) =====
  with ec as (select * from (values ('LZD','LAZADA'),('SHP','SHOPEE'),('TKT','TIKTOK')) v(code,name)),
  wk as (select gs::date we, ((gs::date)-w_first)/7+1 wi from generate_series(w_first+6,p_end,interval '7 days') gs),
  dy as (select gs::date d, (gs::date-w_first) di from generate_series(w_first,p_end,interval '1 day') gs),
  ed as (select channel, date, date_trunc('week',date)::date ws, net_retail from "DOR"
         where channel in ('LZD','SHP','TKT') and date between w_first and p_end)
  select jsonb_object_agg(name, warr), jsonb_object_agg(name, darr)
  into j_ecom, j_ecom_daily
  from (
    select ec.name,
      (select jsonb_agg(coalesce(w.nr,0) order by wk.wi) from wk
        left join (select ws, round(sum(net_retail),2) nr from ed e2 where e2.channel=ec.code group by ws) w
        on w.ws=(wk.we-6)) warr,
      (select jsonb_agg(coalesce(dd.net_retail,0) order by dy.di) from dy
        left join ed dd on dd.channel=ec.code and dd.date=dy.d) darr
    from ec
  ) q;

  -- ===== YBE bookings weekly =====
  --   tot=all rows; canc=Cancelled; visits/capden=Finished/Checked-in/Pending;
  --   cap=those with a phone; new=cap rows on the phone's first-ever capture date
  --   (all history); rep=cap-new.
  with fc as (
    select phone, min(date) fcd from "YBE"
    where status in ('Finished','Checked-in','Pending') and phone is not null group by phone
  ),
  ys as (
    select y.branch, (date_trunc('week',y.date)::date+6) we, y.status, y.phone, y.date, fc.fcd
    from "YBE" y left join fc on fc.phone=y.phone
    where y.branch in ('BGC','EROD','LEV','POD','PPM') and y.date between w_first and p_end
  ),
  yw as (
    select branch, we, count(*) tot,
      count(*) filter (where status='Cancelled') canc,
      count(*) filter (where status in ('Finished','Checked-in','Pending')) visits,
      count(*) filter (where status in ('Finished','Checked-in','Pending') and phone is not null) cap,
      count(*) filter (where status in ('Finished','Checked-in','Pending') and phone is not null and date=fcd) new_
    from ys group by branch, we
  ),
  br as (select * from (values ('BGC'),('EROD'),('LEV'),('POD'),('PPM')) v(code)),
  wk as (select gs::date we, ((gs::date)-w_first)/7+1 wi from generate_series(w_first+6,p_end,interval '7 days') gs)
  select jsonb_object_agg(code, obj) into j_ybe
  from (
    select b.code,
      (select jsonb_build_object(
        'canc',jsonb_agg(coalesce(y.canc,0) order by wk.wi),
        'cap',jsonb_agg(coalesce(y.cap,0) order by wk.wi),
        'capden',jsonb_agg(coalesce(y.visits,0) order by wk.wi),
        'new',jsonb_agg(coalesce(y.new_,0) order by wk.wi),
        'rep',jsonb_agg(coalesce(y.cap,0)-coalesce(y.new_,0) order by wk.wi),
        'tot',jsonb_agg(coalesce(y.tot,0) order by wk.wi),
        'visits',jsonb_agg(coalesce(y.visits,0) order by wk.wi))
       from wk left join yw y on y.branch=b.code and y.we=wk.we) obj
    from br b
  ) q;

  -- ===== BARBERS (SML, gated) + ybeBarbers (all weeks) + coverage =====
  --   vw_weekly_barber is expensive, so it is scanned ONCE into `vwb`.
  --   Gate: attribution coverage >= 95% AND SML days present >= DOR open days.
  --   barbers row  = [name, net_sales_sml, coalesce(retail_net_sml,0), ft_total_sml, days_worked_sml]
  --                  (rows where sales OR retail present), ordered by name.
  --   ybeBarbers row = [name, ft_total_ybe, ft_new_to_branch, ft_new_to_barber, ft_repeat]
  --                  (rows with ft_total_ybe > 0), ordered by name.
  with vwb as (
    select v.week_end we, v.branch, v.barber,
      v.net_sales_sml, v.retail_net_sml, v.ft_total_sml, v.days_worked_sml,
      v.ft_total_ybe, v.ft_new_to_branch, v.ft_new_to_barber, v.ft_repeat,
      v.attribution_coverage_pct cov
    from vw_weekly_barber v
    where v.week_end between w_first+6 and p_end and v.branch in ('BGC','EROD','LEV','POD','PPM')
  ),
  smld as (
    select branch, (date_trunc('week',date)::date+6) we, count(distinct date) sml_days
    from "SML" where date between w_first and p_end and branch in ('BGC','EROD','LEV','POD','PPM')
    group by branch, (date_trunc('week',date)::date+6)
  ),
  opend as (
    select channel branch, (date_trunc('week',date)::date+6) we, count(*) filter (where is_open) open_days
    from "DOR" where date between w_first and p_end and channel in ('BGC','EROD','LEV','POD','PPM')
    group by channel, (date_trunc('week',date)::date+6)
  ),
  gate as (
    select v.we, v.branch, max(v.cov) cov
    from vwb v
    left join smld s on s.branch=v.branch and s.we=v.we
    left join opend o on o.branch=v.branch and o.we=v.we
    group by v.we, v.branch
    having max(v.cov) >= 95 and coalesce(max(s.sml_days),0) >= coalesce(max(o.open_days),7)
  ),
  bar_rows as (
    select v.we, v.branch,
      jsonb_agg(jsonb_build_array(v.barber, v.net_sales_sml, coalesce(v.retail_net_sml,0), v.ft_total_sml, v.days_worked_sml) order by v.barber) arr
    from vwb v join gate g on g.we=v.we and g.branch=v.branch
    where v.net_sales_sml is not null or v.retail_net_sml is not null
    group by v.we, v.branch
  ),
  ybebar_rows as (
    select v.we, v.branch,
      jsonb_agg(jsonb_build_array(v.barber, v.ft_total_ybe, v.ft_new_to_branch, v.ft_new_to_barber, v.ft_repeat) order by v.barber) arr
    from vwb v where coalesce(v.ft_total_ybe,0) > 0
    group by v.we, v.branch
  )
  select
    coalesce((select jsonb_object_agg(to_char(we,'YYYY-MM-DD'), obj) from (select we, jsonb_object_agg(branch,arr) obj from bar_rows group by we) a), '{}'::jsonb),
    coalesce((select jsonb_object_agg(to_char(we,'YYYY-MM-DD'), obj) from (select we, jsonb_object_agg(branch, round(cov/100.0,6)) obj from gate group by we) a), '{}'::jsonb),
    coalesce((select jsonb_object_agg(to_char(we,'YYYY-MM-DD'), obj) from (select we, jsonb_object_agg(branch,arr) obj from ybebar_rows group by we) a), '{}'::jsonb)
  into j_barbers, j_barcov, j_ybebar;

  -- ===== ybePull: latest YBE date per branch =====
  select jsonb_object_agg(branch, to_char(mx,'YYYY-MM-DD')) into j_pull
  from (select branch, max(date) mx from "YBE" where branch in ('BGC','EROD','LEV','POD','PPM') group by branch) t;

  -- ===== lifetime: read the precomputed materialized view =====
  select jsonb_object_agg(to_char(we,'YYYY-MM-DD'), obj) into j_life
  from (select m.we, jsonb_object_agg(m.node, m.tup) obj from dash.mv_lifetime m
        where m.we between w_first+6 and p_end group by m.we) a;

  result := jsonb_build_object(
    'weeks', j_weeks, 'days', j_days,
    'branch', j_branch, 'ybe', j_ybe, 'ecom', j_ecom,
    'barbers', j_barbers, 'barberCov', j_barcov, 'ybeBarbers', j_ybebar,
    'ybePull', j_pull, 'lifetime', j_life,
    'hbd', null,                 -- DATA GAP: no haberdashery source in the DB
    'branchDaily', j_branch_daily, 'ecomDaily', j_ecom_daily
  );
  return result;
end $$;

-- ---------------------------------------------------------------------
-- Public wrapper so PostgREST / anon can call it via /rest/v1/rpc.
-- ---------------------------------------------------------------------
create or replace function public.dash_sales_full(p_end date, p_n int)
returns jsonb language sql stable security definer set search_path = public, pg_temp
set statement_timeout='30s' as $$
  select dash.sales_full(p_end, p_n);
$$;

grant usage on schema dash to anon, authenticated;
grant select on dash.mv_lifetime to anon, authenticated;
grant execute on function public.dash_sales_full(date, int) to anon, authenticated;
