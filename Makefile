# POSIX shell only, LF line endings (see .gitattributes).
SHELL := /bin/sh

.PHONY: setup dev dev-hot reset reset-quota test seed-files check-node check-docker

## setup: install deps, start local Supabase, apply migrations, write .env.local, seed
setup: check-node check-docker
	npm ci
	@$(MAKE) --no-print-directory seed-files
	@# stdout would print the local keys; errors still show on stderr.
	npx supabase start > /dev/null
	npx supabase db reset
	npm run write-env
	npm run build-vocab
	npm run seed
	@echo ""
	@echo "Setup complete. Run 'make dev' and open http://localhost:3000"
	@echo "Sign in as recruiter@acme.test or recruiter@globex.test (password: findlark-demo)."

## dev: build, then serve the production build on http://localhost:3000.
## No on-demand compiling and no dev overhead, so searches run at full speed.
## The build takes about a minute; the server is ready a second after it.
dev: check-node
	npm run build
	npm run start

## dev-hot: Next.js dev server with hot reload on http://localhost:3000 (for editing code)
dev-hot: check-node
	npm run dev

## reset: wipe and re-seed the local database (db reset deletes auth users, so seed again)
reset: check-node check-docker seed-files
	npx supabase db reset
	npm run write-env
	npm run seed

## reset-quota: put acme and globex back on the free plan with 0 searches used
reset-quota: check-node
	npm run reset-quota

## test: build, then every test in order (stops at the first failure).
## The API tests start their own `next start` on port 3100 from that build.
## quota, security and eval call the model (about $0.10 in total) and need ANTHROPIC_API_KEY.
test: check-node check-docker
	npm run test:chips
	npm run test:shortlists
	npm run build
	npm run leak-check
	npm run test:ui-smoke
	npm run test:security
	npm run test:fuzz
	npm run test:quota
	npm run test:billing
	npm run test:sql
	npm run eval
	npm run reset-quota

## seed-files: generate the demo data (scripts/generate-seed.ts) if any seed file is missing.
## The generated files are committed, so this only runs on a fresh or edited checkout.
SEED_FILES := seed/candidates.json seed/queries.json seed/holdout.json seed/stripe-events.json
seed-files:
	@for f in $(SEED_FILES); do [ -f "$$f" ] || missing=1; done; \
	if [ -n "$$missing" ]; then npm run generate-seed && npm run build-vocab; else echo "Seed files present (npm run generate-seed rebuilds them)."; fi

check-node:
	@command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is not installed. Install Node 24 (e.g. 'nvm install 24')." >&2; exit 1; }
	@node -v | grep -q '^v24\.' || { echo "ERROR: Node 24 is required, found $$(node -v). Run 'nvm install 24 && nvm use 24'." >&2; exit 1; }

check-docker:
	@command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed. Install Docker Desktop and start it." >&2; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "ERROR: Docker is not running. Start Docker Desktop, wait until it is ready, then re-run." >&2; exit 1; }
