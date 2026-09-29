-- Materialized-view refresh for the live dashboard.
-- mv_lifetime feeds sales/customers lifetime retention; mv_bvis -> mv_team feed
-- the team page. Everything else on the pages is live; these three are snapshots
-- and must be refreshed after each data load or they lag.
create or replace function dash.refresh_all()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  refresh materialized view dash.mv_lifetime;
  refresh materialized view dash.mv_bvis;   -- before mv_team (mv_team reads it)
  refresh materialized view dash.mv_team;
end $$;

-- Run manually right after a data load for immediate freshness:
--   select dash.refresh_all();

-- Service-role-only PostgREST wrapper so data-load scripts (_load/*.py, which POST
-- with the service_role key) can refresh via RPC. NOT granted to anon.
create or replace function public.dash_refresh_all()
returns void language plpgsql security definer
set search_path = public, pg_temp set statement_timeout = '120s' as $$
begin
  perform dash.refresh_all();
end $$;
revoke execute on function public.dash_refresh_all() from anon;
grant execute on function public.dash_refresh_all() to service_role;

-- Chosen mechanism: load_h1_sml.py calls this at the end of each load.
-- (Nightly pg_cron alternative, left disabled:)
--   select cron.schedule('dash_refresh_mv', '30 18 * * *', $$select dash.refresh_all();$$);
