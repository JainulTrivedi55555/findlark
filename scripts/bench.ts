// Latency benchmark (npm run bench).
//
// Against the production build by default (run `npm run build` first), or against
// a running server with TEST_BASE_URL=http://localhost:3000 (e.g. `make dev`).
// Puts acme on the paid plan, then measures:
//   - the FIRST new search after server start (cold),
//   - N new searches (each includes the model call), with a per-step breakdown
//     from the route's Server-Timing header (auth, reserve, model, finish, read),
//   - 20 page reads of a big result set.
// Prints p50 / p95 / max. Makes N+1 model calls (N=20 by default, `-- --runs 30`).
// Leaves acme free with 0 searches used.
import { adminClient, api, percentile, signIn, withServer } from './lib/server';

const BRIEFS = [
  'senior TypeScript engineers in Chicago who have worked at a startup',
  'data engineers in Denver who know Airflow',
  'staff backend engineers in San Francisco',
  'account executives in Atlanta who are open to work',
  'recruiters in Chicago',
  'mobile engineers who know Kotlin and Android',
  'DevOps engineers in Denver with Terraform',
  'machine learning engineers in Boston',
  'frontend developers who know Vue',
  'product managers with an MBA',
];
const STEPS = ['auth', 'reserve', 'model', 'finish', 'read'];

const args = process.argv.slice(2);
const runsArg = args.indexOf('--runs');
const RUNS = runsArg >= 0 ? Number(args[runsArg + 1]) : 20;

const admin = adminClient();
const stats = (xs: number[]) =>
  `p50 ${Math.round(percentile(xs, 50))} ms, p95 ${Math.round(percentile(xs, 95))} ms, max ${Math.round(Math.max(...xs))} ms`;

/** "auth;dur=1.2, model;dur=900.1" -> { auth: 1.2, model: 900.1 } */
function parseServerTiming(header: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (header ?? '').split(',')) {
    const m = part.trim().match(/^([\w-]+);dur=([\d.]+)$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

async function main() {
  const startedAt = new Date().toISOString();
  await admin.from('companies').update({ plan: 'paid' }).eq('id', 'acme');
  const { token } = await signIn('recruiter@acme.test');
  try {
    await withServer(async (base) => {
      const searchMs: number[] = [];
      const steps: Record<string, number[]> = Object.fromEntries(STEPS.map((s) => [s, []]));
      let first = 0;
      let firstSteps = '';
      let bigId = '';
      // Run 0 is the first search after start; it is reported on its own, not in the stats.
      for (let i = 0; i <= RUNS; i++) {
        const r = await api(base, 'POST', '/api/search', { token, body: { brief: BRIEFS[i % BRIEFS.length] } });
        if (r.status !== 200) throw new Error(`search ${i} returned ${r.status}`);
        if (i === 0) {
          first = r.ms;
          firstSteps = r.headers.get('server-timing') ?? '';
          continue;
        }
        searchMs.push(r.ms);
        const t = parseServerTiming(r.headers.get('server-timing'));
        for (const s of STEPS) if (t[s] !== undefined) steps[s].push(t[s]);
        if (!bigId && r.body.total > 100) bigId = r.body.search_id;
      }
      console.log(`first search after server start: ${Math.round(first)} ms  (${firstSteps})`);
      console.log(`new search x${searchMs.length}: ${stats(searchMs)}  (target p50 < 1300, p95 < 2000)`);
      for (const s of STEPS) if (steps[s].length) console.log(`  ${s.padEnd(8)} ${stats(steps[s])}`);

      if (!bigId) throw new Error('no search with more than 100 results to page');
      const pageMs: number[] = [];
      for (let i = 0; i < 20; i++) {
        const r = await api(base, 'GET', `/api/search/${bigId}?page=${(i % 5) + 1}`, { token });
        if (r.status !== 200) throw new Error(`page ${i} returned ${r.status}`);
        pageMs.push(r.ms);
      }
      console.log(`paging x${pageMs.length}: ${stats(pageMs)}  (target p95 < 300)`);
    });
  } finally {
    await admin.from('searches').delete().eq('company_id', 'acme').gte('created_at', startedAt);
    await admin.from('companies').update({ plan: 'free', searches_used: 0 }).eq('id', 'acme');
  }
}

main().catch((err) => {
  console.error(`bench: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
