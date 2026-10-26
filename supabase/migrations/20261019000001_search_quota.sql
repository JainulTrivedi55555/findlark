-- Free-plan quota and search materialisation.
--
-- Flow for POST /api/search (lib/server/searches.ts):
--   reserve_search -> model call -> finish_search      (refund_search on any failure)
-- Editing filters of an existing search only calls finish_search: no model, no quota.
--
-- All three are security definer (they write tables recruiters cannot write) with
-- search_path pinned, and only service_role may execute them. The server calls
-- them with company and recruiter ids taken from the verified token, never from
-- the request body.

-- Reserve one search for a company, or raise quota_exceeded.
create or replace function public.reserve_search(p_company text, p_recruiter uuid, p_brief text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search uuid;
begin
  -- The quota check and the increment are ONE statement. Postgres row-locks the
  -- company row, and a concurrent UPDATE re-checks the WHERE clause after the
  -- lock is released. So with 20 parallel requests on a free plan, exactly one
  -- sees searches_used < 1 and the other 19 update nothing. No select-then-update race.
  update public.companies
     set searches_used = searches_used + 1
   where id = p_company
     and (plan = 'paid' or searches_used < 1);

  if not found then
    -- The server matches on this exact message to return HTTP 402.
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.searches (company_id, recruiter_id, brief)
  values (p_company, p_recruiter, p_brief)
  returning id into v_search;

  return v_search;
end;
$$;

-- Materialise the full ranked result list for a search and return its size.
-- Rank 1..N follows search_candidates' order (years_experience desc, id), so
-- paging is a primary-key range read that returns every result exactly once.
-- Runs in one transaction: readers see either the old results or the new ones.
create or replace function public.finish_search(p_search uuid, p_filters jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  -- Lock the search row first: proves it exists and serialises two edits of the same search.
  perform 1 from public.searches where id = p_search for update;
  if not found then
    raise exception 'search_not_found' using errcode = 'P0001';
  end if;

  delete from public.search_results where search_id = p_search;

  insert into public.search_results (search_id, rank, candidate_id)
  select p_search,
         row_number() over (order by m.years_experience desc, m.candidate_id),
         m.candidate_id
    from public.search_candidates(p_filters) m;
  get diagnostics v_total = row_count;

  update public.searches
     set filters = p_filters, total = v_total
   where id = p_search;

  return v_total;
end;
$$;

-- Give back a reservation when the model call or the SQL failed, and drop the
-- half-made search. Never takes searches_used below 0.
create or replace function public.refund_search(p_search uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.companies c
     set searches_used = greatest(c.searches_used - 1, 0)
    from public.searches s
   where s.id = p_search
     and c.id = s.company_id;

  delete from public.searches where id = p_search;
end;
$$;

-- Server only (default privileges already exclude anon/authenticated; be explicit).
revoke all on function public.reserve_search(text, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_search(uuid, jsonb)       from public, anon, authenticated;
revoke all on function public.refund_search(uuid)              from public, anon, authenticated;
grant execute on function public.reserve_search(text, uuid, text) to service_role;
grant execute on function public.finish_search(uuid, jsonb)       to service_role;
grant execute on function public.refund_search(uuid)              to service_role;

-- search_results already has primary key (search_id, rank), which is the index
-- paging needs (rank between x and y for one search). No extra index required.
