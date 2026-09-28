-- Public wrapper so the browser (anon) can discover the latest complete
-- week-ending date to request from the *_full RPCs. Newest first.
create or replace function public.dash_weeks()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select dash.weeks();
$$;
grant execute on function public.dash_weeks() to anon;
