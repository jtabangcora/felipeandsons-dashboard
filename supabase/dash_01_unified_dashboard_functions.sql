-- F&S Dashboard (unified): read-only JSON functions for the Vercel app.
create schema if not exists dash;

-- Weeks available: Monday-Sunday weeks where every shop has 7 DOR rows.
create or replace function dash.weeks()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with d as (
    select date_trunc('week', date)::date ws, channel, count(*) n
    from "DOR" where channel in ('BGC','PPM','POD','LEV','EROD') and date >= '2025-12-29'
    group by 1,2
  ), full_weeks as (
    select ws from d where n = 7 group by ws having count(*) = 5
  )
  select coalesce(jsonb_agg(to_char(ws + 6, 'YYYY-MM-DD') order by ws desc), '[]'::jsonb) from full_weeks;
$$;

-- SALES -----------------------------------------------------------------------
create or replace function dash.sales(p_end date, p_n int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  n int := greatest(1, least(coalesce(p_n, 8), 26));
  w_first date := p_end - 6 - 7 * (n - 1);
  m_start date := date_trunc('month', p_end)::date;
  q_start date := date_trunc('quarter', p_end)::date;
  result jsonb;
begin
  with ch as (
    select * from (values ('BGC','shop',1),('PPM','shop',2),('POD','shop',3),('LEV','shop',4),('EROD','shop',5),
                          ('SHP','ecom',6),('LZD','ecom',7),('TKT','ecom',8),('B2B','other',9),('EVENT','other',10)) v(channel, kind, sort)
  ), wk as (
    select gs::date ws from generate_series(w_first, p_end - 6, interval '7 days') gs
  ), agg as (
    select date_trunc('week', d.date)::date ws, d.channel,
      count(*) days,
      count(*) filter (where d.is_open) open_days,
      count(*) filter (where d.is_open and d.net_barber is null) nb_null,
      count(*) filter (where d.net_retail is null) nr_null,
      count(*) filter (where d.is_open and d.traffic_barber is null) ft_null,
      sum(d.net_barber) nb, sum(d.net_retail) nr, sum(d.traffic_barber) ft, sum(d.traffic_retail) buyers,
      sum(d.barbers_available) filter (where d.is_open) avail,
      sum(d.barbers_scheduled) filter (where d.is_open) sched,
      count(*) filter (where d.is_open and (d.barbers_available is null or d.barbers_scheduled is null)) staff_null,
      sum(case when d.channel = 'BGC' then 12 else d.chairs end) filter (where d.is_open) chair_days,
      max(case when d.channel = 'BGC' then 12 else d.chairs end) chairs
    from "DOR" d
    where d.date between w_first and p_end
    group by 1, 2
  ), grid as (
    select ch.channel, ch.kind, ch.sort, wk.ws, a.*
    from ch cross join wk
    left join agg a on a.channel = ch.channel and a.ws = wk.ws
  ), agg_rows as (
    select channel, kind, sort,
      jsonb_agg(jsonb_build_object(
        'we', to_char(ws + 6, 'YYYY-MM-DD'),
        'net', case when kind = 'shop' and days = 7 and nb_null = 0 then nb end,
        'retail', case when days = 7 and nr_null = 0 then nr end,
        'ft', case when kind = 'shop' and days = 7 and ft_null = 0 then ft end,
        'buyers', case when kind = 'shop' and days = 7 then buyers end,
        'arpu', case when kind = 'shop' and days = 7 and nb_null = 0 and ft_null = 0 and ft > 0 then round(nb / ft, 2) end,
        'bav', case when kind = 'shop' and days = 7 and staff_null = 0 and chair_days > 0 then round(avail::numeric / chair_days, 3) end,
        'bat', case when kind = 'shop' and days = 7 and staff_null = 0 and sched > 0 then round(avail::numeric / sched, 3) end,
        'chairs', chairs,
        'open', open_days
      ) order by ws) weeks
    from grid group by channel, kind, sort
  ), period as (
    -- month-to-date and quarter-to-date as at p_end, a period is known only if every day is present
    select p.label, p.start_d,
      (p_end - p.start_d + 1) span,
      d.channel,
      count(d.*) days,
      count(*) filter (where d.is_open and d.net_barber is null) nb_null,
      count(*) filter (where d.net_retail is null) nr_null,
      sum(d.net_barber) nb, sum(d.net_retail) nr
    from (values ('month', m_start), ('quarter', q_start)) p(label, start_d)
    join "DOR" d on d.date between p.start_d and p_end
      and d.channel in ('BGC','PPM','POD','LEV','EROD','SHP','LZD','TKT')
    group by p.label, p.start_d, d.channel
  ), period_ok as (
    select label, start_d, span, channel,
      case when days = span and nb_null = 0 then nb end nb,
      case when days = span and nr_null = 0 then nr end nr
    from period
  ), totals as (
    select pl.label, pl.start_d,
      (p_end - pl.start_d + 1) elapsed,
      case when pl.label = 'month' then (date_trunc('month', p_end) + interval '1 month - 1 day')::date
           else (date_trunc('quarter', p_end) + interval '3 months - 1 day')::date end end_d,
      -- barbershop = 5 shops; null if any shop missing
      case when count(po.channel) filter (where po.channel in ('BGC','PPM','POD','LEV','EROD') and po.nb is not null) = 5
           then sum(po.nb) filter (where po.channel in ('BGC','PPM','POD','LEV','EROD')) end barbershop,
      case when count(po.channel) filter (where po.nr is not null) = 8 then sum(po.nr) end retail,
      jsonb_object_agg(po.channel, jsonb_build_object('net', po.nb, 'retail', po.nr)) filter (where po.channel is not null) by_channel
    from (values ('month', m_start), ('quarter', q_start)) pl(label, start_d)
    left join period_ok po on po.label = pl.label
    group by pl.label, pl.start_d
  ), tg as (
    select t.*, (select amount from targets x where x.unit = 'barbershop' and x.scope = 'unit' and x.node = 'ALL'
                   and x.period_type = t.label and x.period_start = t.start_d) t_barbershop,
                (select basis from targets x where x.unit = 'barbershop' and x.scope = 'unit' and x.node = 'ALL'
                   and x.period_type = t.label and x.period_start = t.start_d) b_barbershop,
                (select amount from targets x where x.unit = 'retail' and x.scope = 'unit' and x.node = 'ALL'
                   and x.period_type = t.label and x.period_start = t.start_d) t_retail,
                (select basis from targets x where x.unit = 'retail' and x.scope = 'unit' and x.node = 'ALL'
                   and x.period_type = t.label and x.period_start = t.start_d) b_retail,
                (select jsonb_object_agg(x.node, x.amount) from targets x where x.unit = 'barbershop' and x.scope = 'branch'
                   and x.period_type = t.label and x.period_start = t.start_d) t_branch
    from totals t
  ), hbd as (
    select jsonb_build_object(
      'month_target', (select amount from targets where unit = 'haberdashery' and period_type = 'month' and period_start = m_start),
      'quarter_target', (select sum(amount) from targets where unit = 'haberdashery' and period_type = 'month'
                          and period_start >= q_start and period_start < q_start + interval '3 months'),
      'orders_loaded', (select count(*) from hbd.orders)) j
  )
  select jsonb_build_object(
    'end', to_char(p_end, 'YYYY-MM-DD'),
    'n', n,
    'weeks', (select jsonb_agg(to_char(ws + 6, 'YYYY-MM-DD') order by ws) from wk),
    'channels', (select jsonb_agg(jsonb_build_object('channel', channel, 'kind', kind, 'weeks', weeks) order by sort) from agg_rows),
    'periods', (select jsonb_agg(jsonb_build_object(
        'label', label, 'start', to_char(start_d, 'YYYY-MM-DD'), 'end', to_char(end_d, 'YYYY-MM-DD'),
        'elapsed', elapsed, 'length', (end_d - start_d + 1),
        'barbershop', barbershop, 'retail', retail,
        'target_barbershop', t_barbershop, 'basis_barbershop', b_barbershop,
        'target_retail', t_retail, 'basis_retail', b_retail,
        'target_branch', t_branch, 'by_channel', by_channel) order by label) from tg),
    'haberdashery', (select j from hbd),
    'data_through', (select to_char(max(date), 'YYYY-MM-DD') from "DOR" where channel = 'BGC')
  ) into result;
  return result;
end $$;

-- CUSTOMERS -------------------------------------------------------------------
create or replace function dash.customers(p_end date, p_n int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  n int := greatest(1, least(coalesce(p_n, 8), 26));
  w_first date := p_end - 6 - 7 * (n - 1);
  result jsonb;
begin
  with br as (
    select * from (values ('BGC',1),('PPM',2),('POD',3),('LEV',4),('EROD',5)) v(branch, sort)
  ), wb as (
    select v.* from vw_weekly_branch v where v.week_start between w_first and p_end - 6
  ), dor as (
    select date_trunc('week', date)::date ws, channel branch, count(*) days,
      sum(walkins_served) walkins, sum(bookings_served) booked, sum(turn_downs) td,
      count(*) filter (where is_open and (walkins_served is null or bookings_served is null)) wb_null,
      count(*) filter (where is_open and turn_downs is null) td_null
    from "DOR" where date between w_first and p_end and channel in ('BGC','PPM','POD','LEV','EROD')
    group by 1, 2
  ), canc as (
    select date_trunc('week', date)::date ws, branch,
      count(*) filter (where status = 'Cancelled') cancelled,
      count(*) filter (where status = 'No Show') no_show,
      count(*) total
    from "YBE" where date between w_first and p_end group by 1, 2
  ), weekly as (
    select br.branch, br.sort, jsonb_agg(jsonb_build_object(
      'we', to_char(wb.week_end, 'YYYY-MM-DD'),
      'served', case when wb.days_ybe is not null then wb.ft_bbs_ybe end,
      'new', wb.ft_new, 'repeat', wb.ft_repeat, 'repeat_pct', wb.repeat_pct,
      'capture_pct', wb.capture_pct,
      'walkins', case when d.days = 7 and d.wb_null = 0 then d.walkins end,
      'booked', case when d.days = 7 and d.wb_null = 0 then d.booked end,
      'turn_downs', case when d.days = 7 and d.td_null = 0 then d.td end,
      'cancel_pct', case when c.total > 0 then round(100.0 * c.cancelled / c.total, 1) end,
      'no_show_pct', case when c.total > 0 then round(100.0 * c.no_show / c.total, 1) end,
      'conversion_pct', wb.conversion_pct
    ) order by wb.week_start) weeks
    from br join wb on wb.branch = br.branch
    left join dor d on d.branch = br.branch and d.ws = wb.week_start
    left join canc c on c.branch = br.branch and c.ws = wb.week_start
    group by br.branch, br.sort
  ), generic as (
    select phone from "YBE" where phone is not null group by phone having count(distinct customer) >= 8
  ), visits as (
    select y.branch, y.phone, y.date from "YBE" y
    where y.status in ('Finished','Checked-in','Pending') and y.phone is not null and y.date <= p_end
      and not exists (select 1 from generic g where g.phone = y.phone)
    group by 1, 2, 3
  ), per_cust as (
    select branch, phone, count(*) visits, max(date) last_d from visits group by 1, 2
  ), params as (
    select branch, lapse_threshold_days lapse from branch_retention_params
    where quarter_start = date_trunc('quarter', p_end)::date
  ), life as (
    select pc.branch, p.lapse, count(*) customers,
      count(*) filter (where visits >= 2) ret,
      case when p.lapse is not null then count(*) filter (where last_d > p_end - p.lapse) end active,
      case when p.lapse is not null then count(*) filter (where last_d <= p_end - p.lapse and last_d > p_end - 365) end lapsed
    from per_cust pc left join params p on p.branch = pc.branch
    group by pc.branch, p.lapse
  ), company as (
    select count(*) customers, count(*) filter (where v >= 2) ret
    from (select phone, count(*) v from (select distinct phone, date from visits) x group by phone) c
  ), rev as (
    select branch, count(*) reviews, round(avg(stars), 2) stars,
      count(*) filter (where stars <= 3) low
    from google_reviews where review_date between w_first and p_end group by branch
  ), rev_all as (
    select branch, count(*) reviews, round(avg(stars), 2) stars from google_reviews where review_date <= p_end group by branch
  )
  select jsonb_build_object(
    'end', to_char(p_end, 'YYYY-MM-DD'), 'n', n,
    'branches', (select jsonb_agg(jsonb_build_object(
        'branch', w.branch, 'weeks', w.weeks,
        'life', (select jsonb_build_object('customers', l.customers, 'returning', l.ret,
                   'returning_pct', round(100.0 * l.ret / nullif(l.customers, 0), 1),
                   'lapse_days', l.lapse, 'active', l.active, 'lapsed', l.lapsed) from life l where l.branch = w.branch),
        'reviews', (select jsonb_build_object('count', coalesce(r.reviews, 0), 'stars', r.stars, 'low', coalesce(r.low, 0))
                    from (select 1) z left join rev r on r.branch = w.branch),
        'reviews_all', (select jsonb_build_object('count', r.reviews, 'stars', r.stars) from rev_all r where r.branch = w.branch)
      ) order by w.sort) from weekly w),
    'company', (select jsonb_build_object('customers', customers, 'returning', ret,
                  'returning_pct', round(100.0 * ret / nullif(customers, 0), 1)) from company),
    'reviews_through', (select to_char(max(review_date), 'YYYY-MM-DD') from google_reviews),
    'ybe_through', (select to_char(max(date), 'YYYY-MM-DD') from "YBE" where status in ('Finished','Checked-in'))
  ) into result;
  return result;
end $$;

-- TEAM ------------------------------------------------------------------------
create or replace function dash.team(p_end date, p_n int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  n int := greatest(1, least(coalesce(p_n, 8), 26));
  w_first date := p_end - 6 - 7 * (n - 1);
  result jsonb;
begin
  with tgt as (
    select * from (values ('BGC',1000),('PPM',950),('POD',920),('LEV',960),('EROD',900)) v(branch, arpu_target)
  ), vb as (
    select * from vw_weekly_barber where week_start between w_first and p_end - 6
  ), cov as (
    select week_start, branch, min(attribution_coverage_pct) cov from vb group by 1, 2
  ), gate as (
    -- a branch-week publishes barber rows only when SML covers every open day and attribution >= 95%
    select b.week_start, b.branch,
      (coalesce(b.days_sml, 0) >= coalesce(b.days_open, 7) and coalesce(c.cov, 0) >= 95) ok
    from vw_weekly_branch b left join cov c on c.week_start = b.week_start and c.branch = b.branch
    where b.week_start between w_first and p_end - 6
  ), wb as (
    select v.*, g.ok from vb v
    join gate g on g.week_start = v.week_start and g.branch = v.branch
    where v.on_roster and v.role_group in ('barber','head','roving')
  ), agg_rows as (
    select wb.branch, wb.barber, bool_or(wb.is_roving) roving, max(wb.role_group) role_group,
      sum(wb.net_sales_sml) filter (where wb.ok) net,
      sum(wb.ft_total_ybe) filter (where wb.ok) clients,
      sum(wb.retail_net_sml) filter (where wb.ok) retail,
      sum(wb.ft_repeat) filter (where wb.ok) rep,
      sum(wb.ft_new_to_barber) filter (where wb.ok) newb,
      sum(wb.days_worked_sml) filter (where wb.ok) days,
      bool_and(wb.ok) all_ok,
      jsonb_agg(jsonb_build_object('we', to_char(wb.week_end, 'YYYY-MM-DD'),
        'net', case when wb.ok then wb.net_sales_sml end,
        'clients', case when wb.ok then wb.ft_total_ybe end) order by wb.week_start) weeks
    from wb group by wb.branch, wb.barber
  ), praise as (
    select m.staff_name, count(*) n from google_review_mentions m
    join google_reviews r on r.id = m.review_pk
    where m.tone = 'praise' and m.match_status in ('matched','confirmed_by_chief')
      and r.review_date between w_first and p_end
    group by m.staff_name
  ), gates as (
    select branch, jsonb_agg(jsonb_build_object('we', to_char(week_start + 6, 'YYYY-MM-DD'), 'ok', ok) order by week_start) weeks
    from gate group by branch
  )
  select jsonb_build_object(
    'end', to_char(p_end, 'YYYY-MM-DD'), 'n', n,
    'barbers', (select jsonb_agg(jsonb_build_object(
        'branch', r.branch, 'barber', r.barber, 'roving', r.roving, 'role', r.role_group,
        'net', r.net, 'clients', r.clients, 'retail', r.retail, 'days', r.days, 'complete', r.all_ok,
        'arpu', round(r.net / nullif(r.clients, 0), 2), 'arpu_target', t.arpu_target,
        'repeat_pct', round(100.0 * r.rep / nullif(r.rep + r.newb, 0), 1),
        'praise', coalesce(p.n, 0), 'weeks', r.weeks
      ) order by r.branch, r.roving, r.barber) from agg_rows r
      left join tgt t on t.branch = r.branch
      left join praise p on p.staff_name = r.barber),
    'gates', (select jsonb_object_agg(branch, weeks) from gates),
    'hiring', (select jsonb_agg(jsonb_build_object('role', role_name, 'branch', branch, 'type', role_type,
                 'status', fill_status, 'fill_by', to_char(fill_by, 'YYYY-MM-DD'), 'seat', seat_no)
               order by fill_by nulls last, branch_sort, type_sort, seat_no) from v_for_hire),
    'reviews_through', (select to_char(max(review_date), 'YYYY-MM-DD') from google_reviews)
  ) into result;
  return result;
end $$;

revoke all on schema dash from public;
revoke all on all functions in schema dash from public;
