-- Haberdashery block for the sales page (REAL.hbd), live from public."HBD".
-- Revenue recognised on order_date. In-house = channel 'IN-HOUSE' or null; events = 'EVENTS'.
-- sales[weekEnd] = [month_total, month_inhouse, month_events, quarter_total, quarter_inhouse, quarter_events] (cumulative).
-- collect[weekEnd] = quarter-to-date { rev = sum(net_price), col = sum(net_price - item_balance), out = sum(item_balance) }.
-- funnel is {} (no pipeline source). NULL order_date rows excluded.
create or replace function dash.hbd_block(p_end date, p_n int)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
with weeks as (
  select (date_trunc('week', gs)::date + 6) as we
  from generate_series(
         (date_trunc('week', p_end)::date + 6) - ((p_n - 1) * 7),
         (date_trunc('week', p_end)::date + 6), '7 days') gs),
d as (
  select order_date, net_price, item_balance,
         (channel='IN-HOUSE' or channel is null) as inhouse,
         (channel='EVENTS') as events
  from public."HBD" where order_date is not null),
sales as (
  select w.we,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('month',w.we)::date and d.order_date <= w.we),0) m_total,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('month',w.we)::date and d.order_date <= w.we and d.inhouse),0) m_inhouse,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('month',w.we)::date and d.order_date <= w.we and d.events),0) m_events,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('quarter',w.we)::date and d.order_date <= w.we),0) q_total,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('quarter',w.we)::date and d.order_date <= w.we and d.inhouse),0) q_inhouse,
    coalesce(sum(d.net_price) filter (where d.order_date >= date_trunc('quarter',w.we)::date and d.order_date <= w.we and d.events),0) q_events,
    coalesce(sum(d.net_price - d.item_balance) filter (where d.order_date >= date_trunc('quarter',w.we)::date and d.order_date <= w.we),0) q_col,
    coalesce(sum(d.item_balance) filter (where d.order_date >= date_trunc('quarter',w.we)::date and d.order_date <= w.we),0) q_out
  from weeks w left join d on d.order_date <= w.we group by w.we)
select jsonb_build_object(
  'sales', coalesce((select jsonb_object_agg(to_char(we,'YYYY-MM-DD'),
             jsonb_build_array(m_total,m_inhouse,m_events,q_total,q_inhouse,q_events)) from sales),'{}'::jsonb),
  'funnel', '{}'::jsonb,
  'collect', coalesce((select jsonb_object_agg(to_char(we,'YYYY-MM-DD'),
             jsonb_build_object('rev',q_total,'col',q_col,'out',q_out)) from sales),'{}'::jsonb));
$$;

-- Wrapper: sales_full + source + hbd, merged.
create or replace function public.dash_sales_full(p_end date, p_n int)
returns jsonb language sql stable security definer set search_path = public, pg_temp
set statement_timeout='30s' as $$
  select dash.sales_full(p_end, p_n)
       || jsonb_build_object('source', dash.source_block(p_end, p_n))
       || jsonb_build_object('hbd', dash.hbd_block(p_end, p_n));
$$;
grant execute on function public.dash_sales_full(date, int) to anon, authenticated;
