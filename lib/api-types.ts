// Response shapes of our /api routes, as the UI sees them.
// Derived from the route handlers in app/api and lib/server/*; keep in sync
// when a route changes. Types only: nothing here runs in the browser.
import type { Filters } from '@/lib/search/schema';

export type { Filters };

/** Every error response: { error, message }, sometimes with extra fields. */
export type ApiErrorBody = {
  error: string;
  message: string;
  searches_remaining?: number;
};

// --- Plan: GET /api/plan ---------------------------------------------------

export type PlanName = 'free' | 'paid';

export type Plan = {
  plan: PlanName;
  /** null when paid (unlimited). Free: 1 search in total. */
  searches_remaining: number | null;
};

// --- Candidates (lib/server/candidates.ts toCard) ---------------------------

export type CandidateCard = {
  id: string;
  name: string;
  headline: string;
  title: string;
  location: { city: string; state: string; country: string };
  years_experience: number;
  role: string;
  seniority: string;
  avatar_url: string;
  current_company: { name: string; logo_url: string };
  skills: string[];
  open_to_work: boolean;
};

// GET /api/people/{id}
export type Experience = {
  title: string;
  company: string;
  company_logo_url: string;
  company_type: string;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
  description: string;
};

export type Education = {
  school: string;
  degree: string;
  field: string;
  graduation_year: number;
};

export type Person = CandidateCard & {
  experiences: Experience[];
  education: Education[];
  /** Which of the caller's shortlists already include this person. */
  shortlist_ids: string[];
};

// --- Search -----------------------------------------------------------------

export type UnsupportedItem = { text: string };

/** GET /api/search/{id}?page=N (lib/server/searches.ts readSearchPage). */
export type SearchPage = {
  search_id: string;
  /** The brief as the recruiter typed it. */
  brief: string;
  filters: Filters;
  unsupported: UnsupportedItem[];
  /** Why there are zero results (unsupported part, no filters, no match), else null. */
  reason: string | null;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  results: CandidateCard[];
};

/** POST /api/search and POST /api/search/{id}/filters: page 1 plus the quota. */
export type SearchResponse = SearchPage & {
  searches_remaining: number | null;
};

/** GET /api/searches: one row of the company's recent searches (finished ones only). */
export type RecentSearch = { id: string; brief: string; total: number; created_at: string };
export type RecentSearchesResponse = { searches: RecentSearch[] };

// --- Shortlists -------------------------------------------------------------

// GET /api/shortlists
export type ShortlistSummary = {
  id: string;
  name: string;
  created_at: string;
  people_count: number;
  person_ids: string[];
};
export type ShortlistsResponse = { shortlists: ShortlistSummary[] };

// GET /api/shortlists/{id}
export type ShortlistDetail = {
  id: string;
  name: string;
  created_at: string;
  people: (CandidateCard & { added_at: string })[];
};

// POST /api/shortlists
export type Created = { id: string };
// PATCH /api/shortlists/{id}
export type Renamed = { id: string; name: string };
// DELETE /api/shortlists/{id}, DELETE /api/saved-briefs/{id}
export type Deleted = { id: string; deleted: true };
// POST / DELETE /api/shortlists/{id}/people/{personId}
export type Membership = { shortlist_id: string; person_id: string; on_list: boolean };

// --- Saved searches: GET /api/saved-briefs ---------------------------------

export type SavedBrief = {
  id: string;
  brief: string;
  filters: Filters;
  created_at: string;
};
export type SavedBriefsResponse = { saved_briefs: SavedBrief[] };
