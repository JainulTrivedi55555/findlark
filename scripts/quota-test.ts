// Free-plan quota, paging and speed, through the real API (npm run test:quota).
//
// Server: starts its own `next start` on port 3100 (needs `npm run build`), or
// uses TEST_BASE_URL if set (e.g. TEST_BASE_URL=http://localhost:3000 with make dev).
// Needs ANTHROPIC_API_KEY: it makes about 8 model calls (~$0.02).
//
//  1. acme on free with 0 used; 20 parallel POST /api/search -> exactly 1x 200, 19x 402
//  2. page that search to the end: every id once, count = total, quota untouched
//  3. POST /api/search/{id}/filters re-runs it (broad filters, many pages) without using quota
//  4. paid plan: several new searches in a row all succeed
// Reports p50/p95 for paging and new searches. Leaves acme on free with 0 used.
import { adminClient, api, percentile, Report, signIn, withServer } from './lib/server';

const BRIEF = 'senior TypeScript engineers in New York who have worked at a startup';
const PAID_BRIEFS = [
  'data engineers in Denver who know Airflow',
  'product managers with an MBA',
  'staff backend engineers in San Francisco',
  'account executives in Atlanta who are open to work',
  'recruiters in Chicago',
  'mobile engineers who know Kotlin and Android',
];

const admin = adminClient();
const report = new Report();

async function setAcme(plan: 'free' | 'paid', searchesUsed?: number) {
  const update: Record<string, unknown> = { plan };
  if (searchesUsed !== undefined) update.searches_used = searchesUsed;
  const { error } = await admin.from('companies').update(update).eq('id', 'acme');
  if (error) throw new Error(`set acme plan: ${error.message}`);
}

async function acmeUsed(): Promise<number> {
  const { data } = await admin.from('companies').select('searches_used').eq('id', 'acme').single();
  return data?.searches_used ?? -1;
}

/** Pages a search to the end; returns ids in order and every page's latency. */
async function pageAll(base: string, token: string, searchId: string) {
  const ids: string[] = [];
  const times: number[] = [];
  let total = -1;
  let totalPages = -1;
  for (let page = 1; ; page++) {
    const r = await api(base, 'GET', `/api/search/${searchId}?page=${page}`, { token });
    times.push(r.ms);
    if (r.status !== 200) throw new Error(`page ${page} returned ${r.status}`);
    total = r.body.total;
    totalPages = r.body.total_pages;
    if (r.body.results.length === 0) break; // past the last page
    ids.push(...r.body.results.map((c: { id: string }) => c.id));
  }
  return { ids, times, total, totalPages };
}

async function main() {
  const startedAt = new Date().toISOString();
  await setAcme('free', 0);
  const { token } = await signIn('recruiter@acme.test');
  const newSearchMs: number[] = [];
  const pagingMs: number[] = [];

  await withServer(async (base) => {
    // --- 1. 20 parallel searches on the free plan ---------------------------
    const burst = await Promise.all(
      Array.from({ length: 20 }, () => api(base, 'POST', '/api/search', { token, body: { brief: BRIEF } })),
    );
    const ok = burst.filter((r) => r.status === 200);
    const limited = burst.filter((r) => r.status === 402);
    const other = burst.filter((r) => r.status !== 200 && r.status !== 402);
    report.add('20 parallel searches: exactly one 200', ok.length === 1, `${ok.length}x 200`);
    report.add('20 parallel searches: 19x 402', limited.length === 19, `${limited.length}x 402, other: ${other.map((r) => r.status).join(',') || 'none'}`);
    report.add('402 body shape', limited.every((r) => r.body.error === 'free_limit_reached' && r.body.searches_remaining === 0 && typeof r.body.message === 'string'), JSON.stringify(limited[0]?.body).slice(0, 80));
    report.add('402s answered without waiting on a model call (all < 3 s)', limited.every((r) => r.ms < 3000), `slowest 402: ${Math.round(Math.max(...limited.map((r) => r.ms)))} ms`);
    report.add('searches_used = 1 after the burst', (await acmeUsed()) === 1, `searches_used=${await acmeUsed()}`);
    if (ok.length !== 1) return;
    const first = ok[0];
    newSearchMs.push(first.ms);
    report.add('first search after server start', first.ms < 5000, `${Math.round(first.ms)} ms (target 3 s; limit 5 s for a cold machine)`);
    report.add('response shape', ['search_id', 'filters', 'unsupported', 'reason', 'total', 'results', 'searches_remaining'].every((k) => k in first.body) && first.body.searches_remaining === 0, `total=${first.body.total}, first page=${first.body.results.length}`);
    const searchId: string = first.body.search_id;

    // --- 2. page it to the end ------------------------------------------------
    const small = await pageAll(base, token, searchId);
    pagingMs.push(...small.times);
    report.add('paging: every id exactly once', new Set(small.ids).size === small.ids.length && small.ids.length === small.total, `${small.ids.length} ids, total ${small.total}`);
    report.add('paging: page 1 = first 20 of the POST', JSON.stringify(small.ids.slice(0, 20)) === JSON.stringify(first.body.results.map((c: { id: string }) => c.id)), '');
    const plan = await api(base, 'GET', '/api/plan', { token });
    report.add('paging uses no search', plan.body.searches_remaining === 0 && (await acmeUsed()) === 1, JSON.stringify(plan.body));

    // --- 3. edit filters: SQL only, no quota ------------------------------------
    const edit = await api(base, 'POST', `/api/search/${searchId}/filters`, { token, body: { filters: { company_types: ['startup'] } } });
    report.add('filter edit returns 200', edit.status === 200, `total=${edit.body.total}, ${Math.round(edit.ms)} ms`);
    report.add('filter edit uses no search', (await acmeUsed()) === 1 && edit.body.searches_remaining === 0, `searches_used=${await acmeUsed()}`);
    const big = await pageAll(base, token, searchId);
    pagingMs.push(...big.times);
    report.add('paging big result: every id exactly once', new Set(big.ids).size === big.ids.length && big.ids.length === big.total, `${big.ids.length} ids over ${big.totalPages} pages`);
    const { count } = await admin.from('candidates').select('id', { count: 'exact', head: true }).eq('id', big.ids[0]);
    report.add('paged ids are real candidates', count === 1, '');

    // --- 4. paid plan: many searches -------------------------------------------
    await setAcme('paid');
    const paid = [];
    for (const brief of PAID_BRIEFS) {
      const r = await api(base, 'POST', '/api/search', { token, body: { brief } });
      paid.push(r);
      if (r.status === 200) newSearchMs.push(r.ms);
    }
    report.add('paid plan: every search succeeds', paid.every((r) => r.status === 200), paid.map((r) => r.status).join(','));
    report.add('paid plan: searches_remaining is null', paid.every((r) => r.body.searches_remaining === null), '');
  });

  // Leave acme as a fresh free account and remove the searches this test made.
  await admin.from('searches').delete().eq('company_id', 'acme').gte('created_at', startedAt);
  await setAcme('free', 0);

  const p = (xs: number[], q: number) => Math.round(percentile(xs, q));
  report.add(`paging p95 < 600 ms; target 300 (${pagingMs.length} requests)`, percentile(pagingMs, 95) < 600, `p50 ${p(pagingMs, 50)} ms, p95 ${p(pagingMs, 95)} ms, max ${p(pagingMs, 100)} ms`);
  report.add(`new search p95 < 5 s; target 3 s (${newSearchMs.length} searches)`, percentile(newSearchMs, 95) < 5000, `p50 ${p(newSearchMs, 50)} ms, p95 ${p(newSearchMs, 95)} ms, max ${p(newSearchMs, 100)} ms`);

  process.exit(report.print() ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`quota-test: ${err instanceof Error ? err.message : err}`);
  await setAcme('free', 0).catch(() => {});
  process.exit(1);
});
