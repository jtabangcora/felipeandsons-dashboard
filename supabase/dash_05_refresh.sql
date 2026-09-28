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

-- Nightly auto-refresh at 02:30 Manila (18:30 UTC). Requires pg_cron.
-- (Left commented; enable once approved.)
--   select cron.schedule('dash_refresh_mv', '30 18 * * *', $$select dash.refresh_all();$$);
