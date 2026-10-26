// Input fuzzing through the real API (npm run test:fuzz, after npm run build).
//
// Throws malformed ids, page numbers, bodies and tokens at every route and
// checks that each answer is a clean 4xx with the standard { error, message }
// shape: never a 500, never an HTML error page. Makes no model call (every
// search body here is rejected before the model, or is a filter edit), and
// leaves the database as it found it.
import { adminClient, api, Report, rowCounts, signIn, withServer } from './lib/server';

const report = new Report();
const admin = adminClient();
const UUID_OTHER = '11111111-1111-4111-8111-111111111111';

const BAD_IDS = ['not-a-uuid', '123', '%00', '..%2f..%2fetc%2fpasswd', "1'%20OR%20'1'='1", 'x'.repeat(300), '00000000-0000-0000-0000-000000000000'];
const BAD_PAGES = ['0', '-1', 'abc', '99999', '1.5', '1e3', '', '%00', '9'.repeat(30), '1&page=2'];

const isCleanError = (r: { status: number; body: any }) => // eslint-disable-line @typescript-eslint/no-explicit-any
  r.status >= 400 && r.status < 500 && typeof r.body === 'object' && typeof r.body.error === 'string' && typeof r.body.message === 'string';

async function main() {
  const acme = await signIn('recruiter@acme.test');
  const globex = await signIn('recruiter@globex.test');
  const before = await rowCounts();

  await withServer(async (base) => {
    const t = acme.token;
    const check = (label: string, r: { status: number; body: any }, ok = isCleanError(r)) => // eslint-disable-line @typescript-eslint/no-explicit-any
      report.add(label, ok && r.status !== 500, `${r.status} ${typeof r.body === 'string' ? r.body.slice(0, 40) : (r.body.error ?? '')}`);

    // A real search belonging to acme to aim page numbers at. Created directly in
    // SQL's table via the admin client (no model call).
    const { data: search } = await admin
      .from('searches')
      .insert({ company_id: 'acme', recruiter_id: acme.userId, brief: 'fuzz fixture', filters: {}, total: 0 })
      .select('id').single();
    const sid = search?.id;
    if (!sid) { report.add('fixture search', false, 'could not insert'); return; }

    for (const id of BAD_IDS) {
      check(`GET /api/search/${id.slice(0, 20)}`, await api(base, 'GET', `/api/search/${id}`, { token: t }));
      check(`GET /api/people/${id.slice(0, 20)}`, await api(base, 'GET', `/api/people/${id}`, { token: t }));
      check(`GET /api/shortlists/${id.slice(0, 20)}`, await api(base, 'GET', `/api/shortlists/${id}`, { token: t }));
      check(`DELETE /api/shortlists/${id.slice(0, 20)}`, await api(base, 'DELETE', `/api/shortlists/${id}`, { token: t }));
      check(`DELETE /api/saved-briefs/${id.slice(0, 20)}`, await api(base, 'DELETE', `/api/saved-briefs/${id}`, { token: t }));
      check(`POST shortlist person ${id.slice(0, 20)}`, await api(base, 'POST', `/api/shortlists/${id}/people/${id}`, { token: t }));
    }
    for (const page of BAD_PAGES) {
      const r = await api(base, 'GET', `/api/search/${sid}?page=${page}`, { token: t });
      // page=99999 on a valid search may be a clean empty page (200) or a 4xx; never 500.
      check(`page=${page || '(empty)'}`, r, r.status < 500 && (r.status === 200 || isCleanError(r)));
    }

    // Bodies: empty, oversized, wrong type, wrong shape, invalid JSON.
    const bodies: [string, string | undefined, string?][] = [
      ['empty body', undefined], ['empty string', ''], ['not json', '{nope'], ['array', '[]'], ['null', 'null'],
      ['number', '42'], ['1 MB body', JSON.stringify({ brief: 'a'.repeat(1_000_000) })],
      ['deep nesting', '['.repeat(5000)], ['brief null', '{"brief":null}'], ['brief empty', '{"brief":""}'], ['brief spaces', '{"brief":"    "}'],
    ];
    for (const [label, raw] of bodies) {
      check(`POST /api/search ${label}`, await api(base, 'POST', '/api/search', { token: t, rawBody: raw ?? undefined, headers: raw === undefined ? { 'content-type': 'application/json' } : {} }));
      check(`POST /api/shortlists ${label}`, await api(base, 'POST', '/api/shortlists', { token: t, rawBody: raw }));
      check(`POST /api/saved-briefs ${label}`, await api(base, 'POST', '/api/saved-briefs', { token: t, rawBody: raw }));
      check(`POST /api/search/{id}/filters ${label}`, await api(base, 'POST', `/api/search/${sid}/filters`, { token: t, rawBody: raw }));
    }
    check('filters with an unknown value', await api(base, 'POST', `/api/search/${sid}/filters`, { token: t, body: { filters: { skills: ["'; DROP TABLE candidates;--"] } } }),
      true);

    // Characters Postgres text cannot store must not become a 500.
    const odd = await api(base, 'POST', '/api/shortlists', { token: t, body: { name: 'a\u0000b\ud800c' } });
    report.add('shortlist name with NUL and lone surrogate', odd.status < 500, String(odd.status));
    if (odd.body?.id) await admin.from('shortlists').delete().eq('id', odd.body.id);
    const oddBrief = await api(base, 'POST', '/api/saved-briefs', { token: t, body: { brief: 'x\u0000y\ud800', filters: {} } });
    report.add('saved brief with NUL and lone surrogate', oddBrief.status < 500, String(oddBrief.status));
    if (oddBrief.body?.id) await admin.from('saved_briefs').delete().eq('id', oddBrief.body.id);

    // Tokens.
    for (const [label, token] of [['no token', undefined], ['garbage token', 'garbage'], ['empty bearer', ''], ['very long token', 'a'.repeat(20000)]] as const) {
      for (const [m, p] of [['GET', '/api/plan'], ['GET', '/api/shortlists'], ['GET', '/api/saved-briefs'], ['GET', `/api/search/${sid}`], ['POST', '/api/search']] as const) {
        const r = await api(base, m, p, { token, body: m === 'POST' ? { brief: 'x' } : undefined });
        // 431 comes from Node's own header-size limit, before our code runs: still a clean 4xx.
        if (label === 'very long token') report.add(`${label}: ${m} ${p.replace(sid, ':id')}`, r.status === 431 || r.status === 401, String(r.status));
        else check(`${label}: ${m} ${p.replace(sid, ':id')}`, r, r.status === 401 && isCleanError(r));
      }
    }
    const basic = await fetch(`${base}/api/plan`, { headers: { authorization: 'Basic YTpi' } });
    report.add('non-Bearer authorization header', basic.status === 401, String(basic.status));

    // Another company's and non-existent ids: 404, never 403/500.
    const foreign = await api(base, 'GET', `/api/search/${sid}`, { token: globex.token });
    report.add("another company's search -> 404", foreign.status === 404, String(foreign.status));
    const missing = await api(base, 'GET', `/api/search/${UUID_OTHER}`, { token: t });
    report.add('unknown search id -> 404', missing.status === 404, String(missing.status));
    const wrongMethod = await api(base, 'PUT', '/api/plan', { token: t });
    report.add('wrong method -> 405, not 500', wrongMethod.status === 405, String(wrongMethod.status));
    const unknownRoute = await api(base, 'GET', '/api/nope', { token: t });
    report.add('unknown route -> JSON 404', unknownRoute.status === 404 && isCleanError(unknownRoute), `${unknownRoute.status} ${typeof unknownRoute.body}`);
    const unknownNested = await api(base, 'POST', '/api/search/x/y/z', { token: t, body: {} });
    report.add('unknown nested route -> JSON 404', unknownNested.status === 404 && isCleanError(unknownNested), `${unknownNested.status} ${typeof unknownNested.body}`);
    const webhook = await api(base, 'POST', '/api/billing/events', { rawBody: '{"x":' });
    report.add('webhook unsigned garbage -> 400', webhook.status === 400, String(webhook.status));

    await admin.from('searches').delete().eq('id', sid);
  });

  const after = await rowCounts();
  const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
  report.add('row counts unchanged', changed.length === 0, changed.join(', ') || 'all tables equal');
  process.exit(report.print() ? 1 : 0);
}

main().catch((err) => {
  console.error(`fuzz-test: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
