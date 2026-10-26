# Architecture

One Next.js app and one local Postgres (Supabase). Postgres does the hard work: RLS for tenant isolation, SQL functions for search, quota and billing. Every guarantee lives in one place, next to the data it protects.

## Layers

- **Data:** `supabase/migrations/` holds all schema, RLS policies and SQL functions.
- **API:** `app/api/**/route.ts` holds validation (zod), auth and calls into the data layer. One folder per route.
- **UI:** `app/(app)/**` and `components/`. The UI calls only our `/api` routes, the same ones any API client uses. It never queries Supabase tables directly for app data.

## Data model

| Table | Key columns | Who can touch it (RLS) |
| --- | --- | --- |
| `companies` | `id` ('acme' / 'globex'), `name`, `plan` ('free' / 'paid'), `searches_used` int | Read own row only. **No update** for recruiters, or they could make themselves paid. |
| `recruiters` | `user_id` (→ auth.users), `company_id` | Read own row only |
| `candidates` | `id`, name, headline, location, years, skills `text[]`, `avatar_url`, `raw jsonb` | Read: any signed-in user. No writes. |
| `experiences` | `candidate_id`, company name, company logo url, title, start, end, is_current, company attributes (from data-notes) | Read: any signed-in user |
| `educations` | `candidate_id`, school, degree, field, years | Read: any signed-in user |
| `searches` | `id`, `company_id`, `recruiter_id`, `brief`, `filters jsonb`, `total`, `created_at` | Read own company. Insert only via server function. |
| `search_results` | `search_id`, `rank`, `candidate_id` (PK: search_id + rank) | Read only for own company's searches |
| `shortlists` | `id`, `company_id`, `name`, `created_at` | Full CRUD on own company; `WITH CHECK` on `company_id` |
| `shortlist_people` | `shortlist_id`, `candidate_id` (PK both), `added_at` | Own company's shortlists only |
| `saved_briefs` | `id`, `company_id`, `brief`, `filters jsonb`, `created_at` | Own company only |
| `subscriptions` | `stripe_subscription_id` (PK), `company_id`, `status`, `last_event_created`, `last_event_id` | None (server only) |
| `stripe_events` | `event_id` (PK), `processed_at` | None (server only) |

Helper: `current_company_id()` is `security definer`, `stable`, with `search_path` set. It reads `recruiters` by `auth.uid()`. Every policy uses it.

Privileges: revoke insert/update/delete on `companies`, `recruiters`, `candidates`, `experiences`, `educations`, `searches`, `search_results` from `anon` and `authenticated`. Revoke all on `subscriptions` and `stripe_events`. Recruiters write only to `shortlists`, `shortlist_people` and `saved_briefs`, through RLS.

Indexes (chosen from the filters in `docs/data-notes.md`): GIN on `candidates.skills`; btree on `years` and `location`; `pg_trgm` on job titles and company names; `search_results (search_id, rank)`.

## Search pipeline

1. **Brief → filters.** One LLM call with the provider's native structured output (no temperature setting: the model rejects it). The system prompt carries the vocabulary from `lib/search/vocab.json` (locations, skills, title families, companies, degrees) plus synonyms (NYC → New York, JS → JavaScript). The brief is wrapped in `<brief></brief>` and treated as data. The output is `{filters: [{field, value}], unsupported: [text]}`: only the filters the brief sets (short output is the main speed lever), plus parts the data cannot answer (every constraint is required, so any unsupported part means zero results). `fromModelOutput` turns the pairs into the raw filter object.
2. **Validate.** Zod parses the output. Synonyms are mapped. Any value not in the vocabulary is dropped into `unsupported` and shown to the user as "couldn't filter by".
3. **Find.** SQL function `search_candidates(filters jsonb)` returns `(candidate_id, years_experience)`. Every constraint is required (AND) and goes in `WHERE`. Order: years_experience desc, then candidate id.
4. **Store.** `finish_search` writes the full ranked list into `search_results` so paging is a plain indexed read.
5. **Page.** `GET /api/search/{id}?page=N` reads `rank BETWEEN (N-1)*20+1 AND N*20`. Stable, every result exactly once, no LLM, no quota.

**Rule:** no valid filters, or an unsupported *required* constraint, means zero results with a reason. Never return everyone.

## Free-plan quota

One atomic statement reserves the search:

```sql
update companies
   set searches_used = searches_used + 1
 where id = $1
   and (plan = 'paid' or searches_used < 1)
returning searches_used;
```

No row back means HTTP 402. Postgres row locking makes it safe under parallel requests. Flow in the route:

1. `reserve_search(company, recruiter, brief)`: quota UPDATE plus insert a `searches` row, or raise `quota_exceeded`.
2. Call the LLM (never for an out-of-quota company).
3. `finish_search(search_id, filters)`: run the search, store results, set `total`.
4. On any failure after step 1: `refund_search(search_id)`.

`searches_remaining` = `null` when paid, otherwise `max(0, 1 - searches_used)`.

**Decision:** only a brief interpreted by the model uses a search. Editing filters calls `POST /api/search/{id}/filters`, which re-runs `finish_search` on the same search with no model call and no quota use. Tradeoff: a free company can refine its one search without limit (SQL is cheap; the model call is what the plan limits). Alternative considered: count every edit as a new search. Airtight, but a free user could never fix a misread filter.

## Billing webhook

`POST /api/billing/events`, no recruiter token.

1. Read the raw body with `await req.text()`. Verify `Stripe-Signature` (HMAC-SHA256 of `${t}.${body}` with `STRIPE_WEBHOOK_SECRET`, timing-safe compare, any matching `v1`) before parsing. Bad or missing signature returns 400.
2. Do not reject on timestamp age (the demo events in `seed/stripe-events.json` are old). Replay safety comes from steps 3 and 4.
3. SQL function `apply_stripe_event(...)` in one transaction:
   - Insert `event_id` into `stripe_events` with `ON CONFLICT DO NOTHING`. If it already existed, return `duplicate` and stop (HTTP 200).
   - Lock the company row `FOR UPDATE` so concurrent events serialise.
   - Upsert the subscription only if `event.created` is newer than `last_event_created`. On equal timestamps the greater event id wins, so the result does not depend on delivery order. An older event is recorded but changes nothing.
4. Recompute `companies.plan = 'paid'` iff the company has any subscription with status `active`; otherwise `free`.
5. Unknown event types, or `metadata.company` missing or not acme/globex: return 200 and ignore.

## Security model

- The browser gets only the Supabase URL and the publishable (anon) key. The secret key and model key are read only in `lib/server/*`, which starts with `import 'server-only'`.
- `requireRecruiter(req)` verifies the Bearer token and returns a Supabase client that queries as that user, so RLS protects data even if a route has a bug.
- The secret key is used only for seeding, the webhook, and security-definer functions the server calls.
- Other companies' resources return 404, not 403.
- Brief: max 500 characters, sent as data inside delimiters, output forced to a schema, every value checked against the vocabulary, every SQL value parameterised.
- All inputs validated with zod. Errors use one shape: `{ "error": string, "message": string }`.

## API routes

| Route | Notes |
| --- | --- |
| `POST /api/search` | Body `{brief, filters?}`. 200 `{search_id, filters, total, results, searches_remaining}`. 402 when out of searches. |
| `GET /api/search/[id]?page=N` | 20 per page. 404 if not own company. Never touches quota. |
| `GET /api/people/[id]` | Candidate with experiences and education. |
| `GET, POST /api/shortlists` | List with counts / create `{name}` returning `{id}`. |
| `PATCH, DELETE /api/shortlists/[id]` | Rename / delete (for the UI). |
| `POST, DELETE /api/shortlists/[id]/people/[personId]` | Add (idempotent) / remove. |
| `GET, POST /api/saved-briefs` | List / save `{brief, filters}`. |
| `DELETE /api/saved-briefs/[id]` | For the UI. |
| `GET /api/plan` | `{plan, searches_remaining}`. |
| `POST /api/billing/events` | Webhook. 400 bad signature, 200 otherwise. |