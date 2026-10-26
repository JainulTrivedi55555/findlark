-- search_candidates(filters jsonb): the people who match every filter, ranked.
--
-- Input is the normalised Filters object from lib/search/schema.ts (already
-- zod-validated and mapped to the vocabulary by the server). Every value is
-- read from the jsonb here; there is no dynamic SQL, so nothing in a brief or
-- an LLM answer can change the shape of the query.
--
-- Semantics (docs/data-notes.md, "How briefs map to filters"):
--   * every filter is required (AND); an empty list or null means "not set"
--   * roles, seniorities, cities, schools, degrees, fields: any of the values
--   * skills: all of them (@>); skills_any: at least one (&&)
--   * companies / company_types: some experience matches, current or past,
--     or only the current job when current_job_only is true
--   * ranking: years_experience desc, then id (deterministic, so paging is stable)
--
-- Defence in depth: no constraint at all, or any unsupported part, returns
-- nothing. The server checks this first; the function never returns everyone.

create or replace function public.search_candidates(filters jsonb)
returns table (candidate_id text, years_experience integer)
language sql
stable
set search_path = ''
as $$
  with f as (
    select
      array(select jsonb_array_elements_text(coalesce(filters->'roles', '[]')))         as roles,
      array(select jsonb_array_elements_text(coalesce(filters->'seniorities', '[]')))   as seniorities,
      array(select jsonb_array_elements_text(coalesce(filters->'cities', '[]')))        as cities,
      array(select jsonb_array_elements_text(coalesce(filters->'skills', '[]')))        as skills,
      array(select jsonb_array_elements_text(coalesce(filters->'skills_any', '[]')))    as skills_any,
      array(select jsonb_array_elements_text(coalesce(filters->'companies', '[]')))     as companies,
      array(select jsonb_array_elements_text(coalesce(filters->'company_types', '[]'))) as company_types,
      array(select jsonb_array_elements_text(coalesce(filters->'schools', '[]')))       as schools,
      array(select jsonb_array_elements_text(coalesce(filters->'degrees', '[]')))       as degrees,
      array(select jsonb_array_elements_text(coalesce(filters->'fields', '[]')))        as fields,
      (filters->>'min_years')::int                                                      as min_years,
      (filters->>'max_years')::int                                                      as max_years,
      (filters->>'open_to_work')::boolean                                               as open_to_work,
      coalesce((filters->>'current_job_only')::boolean, false)                          as current_job_only,
      coalesce(jsonb_array_length(filters->'unsupported'), 0)                           as unsupported_count
  ),
  g as (
    select f.*,
      (cardinality(roles) + cardinality(seniorities) + cardinality(cities) + cardinality(skills)
       + cardinality(skills_any) + cardinality(companies) + cardinality(company_types)
       + cardinality(schools) + cardinality(degrees) + cardinality(fields) > 0
       or min_years is not null or max_years is not null or open_to_work is not null) as has_constraint
    from f
  )
  select c.id, c.years_experience
    from public.candidates c
    cross join g
   where g.has_constraint
     and g.unsupported_count = 0
     and (cardinality(g.roles) = 0       or c.role = any (g.roles))
     and (cardinality(g.seniorities) = 0 or c.seniority = any (g.seniorities))
     and (cardinality(g.cities) = 0      or c.city = any (g.cities))
     and (cardinality(g.skills) = 0      or c.skills @> g.skills)
     and (cardinality(g.skills_any) = 0  or c.skills && g.skills_any)
     and (g.min_years is null            or c.years_experience >= g.min_years)
     and (g.max_years is null            or c.years_experience <= g.max_years)
     and (g.open_to_work is null         or c.open_to_work = g.open_to_work)
     and (cardinality(g.companies) = 0 or exists (
           select 1 from public.experiences e
            where e.candidate_id = c.id
              and e.company = any (g.companies)
              and (not g.current_job_only or e.end_year is null)))
     and (cardinality(g.company_types) = 0 or exists (
           select 1 from public.experiences e
            where e.candidate_id = c.id
              and e.company_type = any (g.company_types)
              and (not g.current_job_only or e.end_year is null)))
     -- One education row must satisfy school, degree and field together
     -- ("PhD from Stanford" means the same degree). Everyone has exactly one.
     and (cardinality(g.schools) + cardinality(g.degrees) + cardinality(g.fields) = 0 or exists (
           select 1 from public.educations ed
            where ed.candidate_id = c.id
              and (cardinality(g.schools) = 0 or ed.school = any (g.schools))
              and (cardinality(g.degrees) = 0 or ed.degree = any (g.degrees))
              and (cardinality(g.fields) = 0  or ed.field = any (g.fields))))
   order by c.years_experience desc, c.id asc
$$;

-- Server only. Default privileges (see the RLS migration) already keep it from
-- anon and authenticated; say it explicitly anyway.
revoke all on function public.search_candidates(jsonb) from public, anon, authenticated;
grant execute on function public.search_candidates(jsonb) to service_role;
