# Findlark

Describe who you're hiring in plain English and get a ranked, pageable list of matching candidates. Built with Next.js 16 (App Router), TypeScript and a local Supabase stack (Postgres, Auth, row-level security). The candidates, companies and briefs are generated demo data; no real people are involved.

## Running it

You need Node 24 and Docker. Searches call the Anthropic API, so export a key first (everything else works without one):

    export ANTHROPIC_API_KEY=...
    export STRIPE_WEBHOOK_SECRET=whsec_findlark_demo_sample   # only for the billing webhook
    make setup
    make dev        # builds, then serves the production build on http://localhost:3000

`make setup` installs dependencies, starts Supabase 2.119.0, applies the migrations and loads the 5,000 demo candidates. If a seed file is missing it first runs `npm run generate-seed`, which rebuilds them deterministically. `make dev` builds the app (about a minute) and then serves the production build; `make dev-hot` runs the hot-reload dev server for editing code. Sign in as `recruiter@acme.test` or `recruiter@globex.test` with the password `findlark-demo`.

## How search works

The brief goes to the Anthropic API (model `claude-sonnet-5-5`, structured output), which returns only the filters it set, as a short list of field/value pairs: roles, seniority, years, cities, skills, companies, company type (startup or enterprise), schools, degrees, fields of study and open-to-work. The server checks every value against a vocabulary built from the candidate data. A Postgres function applies all filters together and ranks people by years of experience, then id. The ranked list is stored against the search, so paging is a plain indexed read and every result appears exactly once. Every filter the model understood is shown as a chip you can remove or edit; editing re-runs the SQL without calling the model.

## Keeping the model honest

The model never sees candidates, only the brief, wrapped in tags and treated as data. Its answer is validated against a schema, and every value must match the real vocabulary (synonyms like NYC, k8s or CMU are mapped first). Anything the data can't answer, such as languages, salary or "great", goes to an "unsupported" list. Every part of a brief is required, so one unsupported part returns nobody, with the reason shown. No valid filters never means "return everyone". SQL values are read from a jsonb argument inside a function, so no query is built from a string.

To check it, `scripts/generate-seed.ts` writes 10 example briefs and 40 holdout briefs with the ids that should match, computed by a plain TypeScript filter that is independent of the SQL. `npm run test:sql` checks the SQL against that ground truth without the model; `npm run eval` runs the briefs through the model and reports precision, recall, F1, precision on page 1, tokens and latency (`npm run eval -- --only holdout` for the 40 holdout briefs, `eval/extra.json` for vague and hostile ones).

## Model and cost

Sonnet 5.5 rather than Haiku 5.5, because a misread brief costs more than a slower one; Haiku is a one-line change in `lib/server/llm.ts` and the eval shows whether it holds up. The system prompt (rules plus the whole vocabulary) is static, so it is cached after the first call. At list prices ($2 in, $0.20 cached, $10 out per million tokens) a search with about 4,000 cached prompt tokens, a few dozen fresh ones and 60 output tokens comes to roughly $0.0015. `npm run eval` prints the measured token averages.

## Isolation, quota and billing

Row-level security separates the two companies. Recruiters can only write their company's shortlists and saved searches, and another company's ids return 404. The free plan (one search) is enforced by one conditional UPDATE that reserves the search before the model is called and gives it back if anything fails, so 20 parallel requests produce exactly one success. The Stripe webhook verifies the signature on the raw body, ignores event ids it has seen, and orders events by `event.created` rather than the header timestamp, so an older event can never overwrite a newer state. `seed/stripe-events.json` has signed demo events (a duplicate, an out-of-order pair and a cancellation) that `npm run test:billing` replays.

## Tradeoffs

- Editing filters re-runs SQL only. Only a brief the model reads uses the free search, so a free company can refine its one search without limit. Re-running a saved search does use a search.
- Speed is dominated by the model call; asking it for only the filters it set keeps the output short. The call has a 5 s timeout and two retries, so the worst case is long. `npm run bench` measures it on your machine.
- The webhook has no timestamp tolerance, because the demo events are old. Replays are harmless thanks to dedupe and ordering.
- "senior" means exactly the senior band, and quality words like "experienced" return nobody. A recruiter might expect "senior" to include staff.
- The demo data is clean and generated, so the eval measures how well briefs are read, not how well messy profiles are matched.

## Next steps

Embeddings for fuzzy title and skill matching, briefs written by real recruiters for the eval, an overall deadline on the model call, graceful handling of stale sessions, rate limiting and logging, and a real Stripe checkout.
