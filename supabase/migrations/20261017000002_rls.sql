-- Tenant isolation: RLS on every table, policies keyed on current_company_id(),
-- and table privileges trimmed so recruiters can only write what they own.
--
-- Two layers, on purpose:
--   1. GRANTs decide which operations a role may attempt at all. Recruiters
--      (role "authenticated") can only write shortlists, shortlist_people and
--      saved_briefs. Everything else is read-only or invisible.
--   2. RLS policies decide which rows those operations see. Every policy goes
--      through current_company_id(), so one company never sees another's rows.

-- ---------------------------------------------------------------------------
-- Helper: the signed-in recruiter's company
-- ---------------------------------------------------------------------------

-- security definer: runs as the owner, so it can read recruiters without
-- tripping that table's own RLS (and without recursion when policies call it).
-- stable: same answer within a statement, so Postgres can evaluate it once.
-- search_path = '': every name below is schema-qualified, so a caller cannot
-- shadow public.recruiters with their own object.
create or replace function public.current_company_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select r.company_id
    from public.recruiters r
   where r.user_id = auth.uid()
$$;

revoke all on function public.current_company_id() from public, anon;
grant execute on function public.current_company_id() to authenticated, service_role;

-- New rows default to the caller's company, so the API never has to pass it.
-- WITH CHECK below still rejects any explicit company_id that is not theirs.
alter table public.shortlists   alter column company_id set default public.current_company_id();
alter table public.saved_briefs alter column company_id set default public.current_company_id();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. A table with RLS on and no policy is invisible.
-- ---------------------------------------------------------------------------

alter table public.companies        enable row level security;
alter table public.recruiters       enable row level security;
alter table public.candidates       enable row level security;
alter table public.experiences      enable row level security;
alter table public.educations       enable row level security;
alter table public.searches         enable row level security;
alter table public.search_results   enable row level security;
alter table public.shortlists       enable row level security;
alter table public.shortlist_people enable row level security;
alter table public.saved_briefs     enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.stripe_events    enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Supabase grants ALL on new public tables to anon and authenticated by default.
-- Start from nothing and add back only what is needed. Note TRUNCATE ignores
-- RLS entirely, which is one more reason to start from "revoke all".
revoke all on all tables in schema public from anon, authenticated;

-- Same for anything later migrations create: no automatic grants on new tables
-- or functions. Each one must grant explicitly, so nothing is exposed by accident.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- The signed-out browser (anon) gets nothing. Every app read is authenticated.

-- Read-only for recruiters. In particular no UPDATE on companies, so a
-- recruiter can never change their own plan or searches_used.
grant select on public.companies, public.recruiters,
                public.candidates, public.experiences, public.educations,
                public.searches, public.search_results
  to authenticated;

-- The only tables a recruiter writes. Rows are still filtered by the policies below.
grant select, insert, update, delete on public.shortlists, public.shortlist_people, public.saved_briefs
  to authenticated;

-- subscriptions and stripe_events: nothing for anon or authenticated (revoked above).
-- Only the server, using the secret key (service_role), touches billing state.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- Own company row only (to show plan and searches used).
create policy companies_select_own on public.companies
  for select to authenticated
  using (id = public.current_company_id());

-- Own recruiter row only.
create policy recruiters_select_own on public.recruiters
  for select to authenticated
  using (user_id = auth.uid());

-- Candidates are shared by every company.
create policy candidates_select_all on public.candidates
  for select to authenticated using (true);
create policy experiences_select_all on public.experiences
  for select to authenticated using (true);
create policy educations_select_all on public.educations
  for select to authenticated using (true);

-- Searches are inserted by server functions; recruiters only read their company's.
create policy searches_select_own on public.searches
  for select to authenticated
  using (company_id = public.current_company_id());

create policy search_results_select_own on public.search_results
  for select to authenticated
  using (exists (
    select 1 from public.searches s
     where s.id = search_results.search_id
       and s.company_id = public.current_company_id()
  ));

-- Full CRUD on the company's own shortlists. USING filters what can be read,
-- updated or deleted; WITH CHECK stops inserting a row for another company or
-- moving an existing row to another company.
create policy shortlists_own on public.shortlists
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Membership rows belong to whoever owns the parent shortlist.
create policy shortlist_people_own on public.shortlist_people
  for all to authenticated
  using (exists (
    select 1 from public.shortlists s
     where s.id = shortlist_people.shortlist_id
       and s.company_id = public.current_company_id()
  ))
  with check (exists (
    select 1 from public.shortlists s
     where s.id = shortlist_people.shortlist_id
       and s.company_id = public.current_company_id()
  ));

create policy saved_briefs_own on public.saved_briefs
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- subscriptions, stripe_events: no policies on purpose.
