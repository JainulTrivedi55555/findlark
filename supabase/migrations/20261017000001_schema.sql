-- Schema: tables and indexes. RLS, policies and grants live in the next migration.
-- Column shapes follow docs/data-notes.md (the data is clean and every enum is small).

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

create table public.companies (
  id            text primary key,                 -- 'acme' / 'globex', matches Stripe metadata.company
  name          text not null,
  plan          text not null default 'free' check (plan in ('free', 'paid')),
  searches_used integer not null default 0 check (searches_used >= 0),
  created_at    timestamptz not null default now()
);

create table public.recruiters (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  company_id text not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index recruiters_company_id_idx on public.recruiters (company_id);

-- ---------------------------------------------------------------------------
-- Candidates (shared by every company, read-only for recruiters)
-- ---------------------------------------------------------------------------

create table public.candidates (
  id                       text primary key,      -- 'cand_0001'; sorts correctly as text
  full_name                text not null,
  headline                 text not null,
  current_title            text not null,
  current_company          text not null,
  current_company_logo_url text not null,
  role                     text not null,         -- 13 role families, never changes across a career
  seniority                text not null check (seniority in ('junior', 'mid', 'senior', 'staff')),
  years_experience         integer not null check (years_experience between 0 and 60),
  city                     text not null,         -- only city is worth filtering on (country is always US)
  state                    text not null,
  country                  text not null,
  open_to_work             boolean not null,
  skills                   text[] not null,
  avatar_url               text not null
);

-- Filters from data-notes: role, seniority, city, open_to_work are exact matches;
-- skills use array containment (@>), which GIN serves.
create index candidates_role_idx      on public.candidates (role);
create index candidates_seniority_idx on public.candidates (seniority);
create index candidates_city_idx      on public.candidates (city);
create index candidates_skills_gin    on public.candidates using gin (skills);
-- Ranking is years_experience desc, then id.
create index candidates_rank_idx      on public.candidates (years_experience desc, id);

-- One row per work-history entry. (candidate_id, position) is a natural key so the
-- seed can upsert idempotently. position 0 is the current job (end_year is null).
create table public.experiences (
  candidate_id     text not null references public.candidates (id) on delete cascade,
  position         smallint not null,
  title            text not null,
  company          text not null,
  company_logo_url text not null,
  company_type     text not null check (company_type in ('startup', 'enterprise')),
  start_year       integer not null,
  end_year         integer,                        -- null = current job
  is_current       boolean generated always as (end_year is null) stored,
  description      text not null,
  primary key (candidate_id, position)
);
-- "worked at a startup" and "worked at <company>" are EXISTS lookups by these columns.
create index experiences_company_type_idx on public.experiences (company_type, candidate_id);
create index experiences_company_idx      on public.experiences (company, candidate_id);

-- Always exactly one entry per candidate in the data, but modelled as a list.
create table public.educations (
  candidate_id    text not null references public.candidates (id) on delete cascade,
  position        smallint not null,
  school          text not null,
  degree          text not null,
  field           text not null,
  graduation_year integer not null,
  primary key (candidate_id, position)
);
create index educations_school_idx on public.educations (school, candidate_id);
create index educations_degree_idx on public.educations (degree, candidate_id);
create index educations_field_idx  on public.educations (field, candidate_id);

-- ---------------------------------------------------------------------------
-- Searches (written only by server-side functions)
-- ---------------------------------------------------------------------------

create table public.searches (
  id           uuid primary key default gen_random_uuid(),
  company_id   text not null references public.companies (id) on delete cascade,
  recruiter_id uuid not null references auth.users (id) on delete cascade,
  brief        text not null check (char_length(brief) <= 500),
  filters      jsonb,                              -- null until the LLM step finishes
  total        integer,                            -- null until results are materialised
  created_at   timestamptz not null default now()
);
create index searches_company_id_idx on public.searches (company_id, created_at desc);

-- The full ranked result list, written once when the search runs, so paging is
-- an indexed range read on the primary key: rank between (page-1)*20+1 and page*20.
create table public.search_results (
  search_id    uuid not null references public.searches (id) on delete cascade,
  rank         integer not null check (rank >= 1),
  candidate_id text not null references public.candidates (id) on delete cascade,
  primary key (search_id, rank)
);

-- ---------------------------------------------------------------------------
-- Recruiter-owned data (full CRUD for the owning company, through RLS)
-- ---------------------------------------------------------------------------

create table public.shortlists (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);
create index shortlists_company_id_idx on public.shortlists (company_id, created_at desc);

create table public.shortlist_people (
  shortlist_id uuid not null references public.shortlists (id) on delete cascade,
  candidate_id text not null references public.candidates (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (shortlist_id, candidate_id)         -- adding twice is a no-op
);
create index shortlist_people_candidate_idx on public.shortlist_people (candidate_id);

create table public.saved_briefs (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies (id) on delete cascade,
  brief      text not null check (char_length(brief) <= 500),
  filters    jsonb not null,
  created_at timestamptz not null default now()
);
create index saved_briefs_company_id_idx on public.saved_briefs (company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Billing (server only, no recruiter access at all)
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  stripe_subscription_id text primary key,
  company_id             text not null references public.companies (id) on delete cascade,
  status                 text not null,
  last_event_created     bigint not null,          -- event.created from the body, never the header t
  last_event_id          text not null,
  updated_at             timestamptz not null default now()
);
create index subscriptions_company_id_idx on public.subscriptions (company_id);

create table public.stripe_events (
  event_id     text primary key,                   -- dedupe key for redeliveries
  type         text not null,
  created      bigint not null,
  processed_at timestamptz not null default now()
);
