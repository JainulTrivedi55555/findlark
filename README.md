# Findlark

Describe who you're hiring in plain English and get a ranked, pageable list of matching candidates.

> "senior React engineers in New York who have worked at a startup"

An LLM turns the sentence into structured filters, Postgres finds and ranks the people, and every filter is shown back as a chip you can remove or edit. The candidates, companies and briefs are generated demo data. No real people are involved.

## What it does

- **Plain-English search.** The brief becomes filters; Postgres does the matching. The model never sees a candidate.
- **Editable filters.** Remove or change any chip and re-run the search without retyping. Editing re-runs SQL only.
- **Candidate pages.** Experience, education and skills.
- **Shortlists.** Create, rename and delete named lists, and add or remove candidates.
- **Saved searches.** Keep a brief with its filters and re-run it later.
- **Two companies, fully separated.** Row-level security keeps one company's shortlists and saved searches away from the other.
- **Free plan.** One search per company, enforced on the server even under concurrent requests.
- **Billing by webhook.** A signed Stripe event moves a company to paid, and a cancellation drops it back to free.
- **Clear states.** Loading, empty and error states, and a layout that works on a phone.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS and shadcn/ui, Supabase running locally (Postgres, Auth, row-level security), zod, and the Anthropic API (`claude-sonnet-5-5`, structured output).

## Running it

You need Node 24 and Docker. Searches call the Anthropic API, so export a key first. Everything else works without one.

```bash
export ANTHROPIC_API_KEY=...
export STRIPE_WEBHOOK_SECRET=whsec_findlark_demo_sample   # only for the billing webhook
make setup
make dev        # builds, then serves the production build on http://localhost:3000
```

`make setup` installs dependencies, starts Supabase, applies the migrations and loads 5,000 demo candidates. If a seed file is missing it first runs `npm run generate-seed`, which rebuilds the data deterministically. `make dev` builds the app (about a minute) and then serves it; `make dev-hot` runs the hot-reload dev server for editing code.

Sign in as `recruiter@acme.test` or `recruiter@globex.test` with the password `findlark-demo`.

## How search works

The brief goes to the Anthropic API, which returns only the filters it set, as a short list of field/value pairs: roles, seniority, years of experience, cities, skills, companies, company type (startup or enterprise), schools, degrees, fields of study and open-to-work. The server checks every value against a vocabulary built from the candidate data. A Postgres function applies all filters together and ranks people by years of experience, then id. The ranked list is stored against the search, so paging is a plain indexed read and every result appears exactly once.

### Keeping the model honest

The model never sees candidates, only the brief, wrapped in tags and treated as data. Its answer is validated against a schema, and every value must match the real vocabulary (synonyms such as NYC, k8s or CMU are mapped first). Anything the data can't answer, such as languages, salary or "great", goes to an "unsupported" list. Every part of a brief is required, so one unsupported part returns nobody, with the reason shown. Having no valid filters never means "return everyone". SQL values are read from a jsonb argument inside a function, so no query is built from a string.

## Model and cost

Sonnet 5.5 rather than Haiku 5.5, because a misread brief costs more than a slower one. Switching is a one-line change in `lib/server/llm.ts`, and the eval shows whether the smaller model holds up. The system prompt (rules plus the whole vocabulary) is static, so it is cached after the first call. At list prices ($2 in, $0.20 cached, $10 out per million tokens), a search with about 4,000 cached prompt tokens, a few dozen fresh ones and 60 output tokens comes to roughly $0.0015. That is an estimate; `npm run eval` prints the measured token averages.

## Isolation, quota and billing

- **Isolation.** Row-level security separates the two companies. Recruiters can only write their own company's shortlists and saved searches, and another company's ids return 404.
- **Free plan.** One conditional UPDATE reserves the search before the model is called and gives it back if anything fails, so 20 parallel requests produce exactly one success.
- **Webhook.** It verifies the signature on the raw body, ignores event ids it has already seen, and orders events by `event.created` rather than the header timestamp, so an older event can never overwrite a newer state.

## Tests

`make test` builds the app and runs the suites. Some of them call the model and need a funded key.

| Command | What it checks |
|---|---|
| `npm run test:sql` | The SQL search against ground truth computed by a plain TypeScript filter (no model) |
| `npm run test:billing` | Signed demo events: duplicate, out-of-order pair, cancellation, bad signatures |
| `npm run test:fuzz` | Garbage input never causes a server error |
| `npm run test:security` | Cross-company access and hostile briefs |
| `npm run test:quota` | The one-search limit under parallel requests |
| `npm run test:e2e` | Browser flows, including error states and phone layout |
| `npm run eval` | Briefs through the model: precision, recall, F1, tokens, latency |
| `npm run bench` | Search and paging latency on your machine |

## Tradeoffs

- Editing filters re-runs SQL only. Only a brief the model reads uses the free search, so a free company can refine its one search without limit. Re-running a saved search does use a search.
- Speed is dominated by the model call, so the model is asked for only the filters it set. The call has a 5 s timeout and two retries, so the worst case is long.
- The webhook has no timestamp tolerance, because the demo events are old. Replays are harmless thanks to dedupe and ordering.
- "senior" means exactly the senior band, and quality words such as "experienced" return nobody. A recruiter might expect "senior" to include staff.
- The demo data is clean and generated, so the eval measures how well briefs are read, not how well messy profiles are matched.
- There is no real Stripe checkout. The upgrade dialog explains how a company becomes paid.
