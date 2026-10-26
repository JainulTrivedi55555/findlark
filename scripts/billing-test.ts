// Billing webhook test (npm run test:billing).
//
// Server: starts its own `next start` on port 3100 with
// STRIPE_WEBHOOK_SECRET=whsec_findlark_demo_sample (needs `npm run build`).
// With TEST_BASE_URL, that server must use the same secret.
//
//  1. Reset billing tables and both companies to free.
//  2. Replay seed/stripe-events.json (scripts/generate-seed.ts) byte for byte in
//     file order, printing GET /api/plan for both companies after each event;
//     check each event's expected_result and the final state.
//  3. Self-signed events: bad signatures, duplicates, both delivery orders of an
//     out-of-order pair, equal-timestamp tie-break, cancellation, unknown company,
//     unknown type, 20 identical events in parallel.
//  4. A signed-in recruiter cannot read or write billing tables.
// Leaves both companies on free with empty billing tables.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { adminClient, api, Report, signIn, withServer } from './lib/server';

const SECRET = 'whsec_findlark_demo_sample';
const admin = adminClient();
const report = new Report();

type SeedFile = {
  events: { description: string; headers: { 'Stripe-Signature': string }; payload: string; expected_result: string }[];
  expected_plans_after: Record<string, string>;
};

function sign(payload: string, secret = SECRET, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

let seq = 0;
/** A Stripe-like subscription event body. Unique id per call unless one is given. */
function event(opts: { company: string; sub: string; status: string; created: number; type?: string; id?: string }): string {
  return JSON.stringify({
    id: opts.id ?? `evt_test_${Date.now()}_${seq++}`,
    object: 'event',
    created: opts.created,
    type: opts.type ?? 'customer.subscription.updated',
    data: { object: { id: opts.sub, object: 'subscription', status: opts.status, metadata: { company: opts.company } } },
  });
}

async function resetBilling() {
  await admin.from('subscriptions').delete().neq('stripe_subscription_id', '');
  await admin.from('stripe_events').delete().neq('event_id', '');
  await admin.from('companies').update({ plan: 'free' }).in('id', ['acme', 'globex']);
}

async function main() {
  await resetBilling();
  await admin.from('companies').update({ searches_used: 0 }).in('id', ['acme', 'globex']);
  const acme = await signIn('recruiter@acme.test');
  const globex = await signIn('recruiter@globex.test');

  await withServer(
    async (base) => {
      const post = (payload: string, signature?: string) =>
        api(base, 'POST', '/api/billing/events', {
          rawBody: payload,
          headers: signature === undefined ? {} : { 'stripe-signature': signature },
        });
      const plans = async () => {
        const [a, g] = await Promise.all([
          api(base, 'GET', '/api/plan', { token: acme.token }),
          api(base, 'GET', '/api/plan', { token: globex.token }),
        ]);
        return { acme: a.body.plan as string, globex: g.body.plan as string };
      };

      // --- 2. replay the sample file in order -------------------------------
      const seed = JSON.parse(readFileSync('seed/stripe-events.json', 'utf8')) as SeedFile;
      console.log('\nReplaying seed/stripe-events.json (original signatures):');
      console.log('  #  status  result     acme  globex  event');
      for (const [i, e] of seed.events.entries()) {
        const r = await post(e.payload, e.headers['Stripe-Signature']);
        const p = await plans();
        console.log(`  ${i + 1}  ${r.status}     ${String(r.body.result).padEnd(9)}  ${p.acme.padEnd(4)}  ${p.globex.padEnd(6)}  ${e.description}`);
        report.add(`seed #${i + 1} ${e.description}`, r.status === 200 && r.body.result === e.expected_result,
          `${r.status} ${r.body.result} (expected ${e.expected_result})`);
      }
      const final = await plans();
      report.add('seed final state matches expected_plans_after',
        JSON.stringify(final) === JSON.stringify(seed.expected_plans_after), JSON.stringify(final));

      // --- 3a. signatures ------------------------------------------------------
      await resetBilling();
      const now = Math.floor(Date.now() / 1000);
      const good = event({ company: 'acme', sub: 'sub_t_acme', status: 'active', created: now });
      const tampered = good.replace('"active"', '"activ"');
      report.add('tampered body -> 400', (await post(tampered, sign(good))).status === 400);
      report.add('wrong secret -> 400', (await post(good, sign(good, 'whsec_wrong'))).status === 400);
      report.add('missing header -> 400', (await post(good)).status === 400);
      report.add('garbage header -> 400', (await post(good, 'nonsense')).status === 400);
      report.add('v0-only header -> 400', (await post(good, sign(good).replace('v1=', 'v0='))).status === 400);
      const notJson = '{"id": "evt_broken", ';
      const bad = await post(notJson, sign(notJson));
      report.add('signed but unparseable JSON -> 400', bad.status === 400, `${bad.status} ${bad.body.error}`);
      report.add('bad signatures changed nothing', (await plans()).acme === 'free');
      const multi = `${sign(good, 'whsec_old')},${sign(good).split(',')[1]}`; // rotated secret: two v1 values
      const multiRes = await post(good, multi);
      report.add('any matching v1 is accepted', multiRes.status === 200 && multiRes.body.result === 'applied', `${multiRes.status} ${multiRes.body.result}`);
      const old = event({ company: 'globex', sub: 'sub_t_old', status: 'canceled', created: now });
      const oldTs = await post(old, sign(old, SECRET, 946684800)); // signed in the year 2000
      report.add('old signature timestamp accepted (no age check)', oldTs.status === 200, `${oldTs.status} ${oldTs.body.result}`);

      // --- 3b. duplicates -------------------------------------------------------
      await resetBilling();
      const dup = event({ company: 'acme', sub: 'sub_t_dup', status: 'active', created: now });
      const d1 = await post(dup, sign(dup));
      const d2 = await post(dup, sign(dup, SECRET, now + 5)); // redelivery: new t, same body
      const afterDup = await plans();
      report.add('same event twice -> 200, 200', d1.status === 200 && d2.status === 200, `${d1.body.result}, ${d2.body.result}`);
      report.add('second delivery is a no-op', d2.body.result === 'duplicate' && afterDup.acme === 'paid', JSON.stringify(afterDup));

      // --- 3c. out-of-order pair, both orders -------------------------------------
      const pair = (suffix: string) => ({
        older: event({ company: 'globex', sub: `sub_t_pair_${suffix}`, status: 'incomplete', created: now - 60, type: 'customer.subscription.created' }),
        newer: event({ company: 'globex', sub: `sub_t_pair_${suffix}`, status: 'active', created: now }),
      });
      await resetBilling();
      const inOrder = pair('a');
      await post(inOrder.older, sign(inOrder.older));
      await post(inOrder.newer, sign(inOrder.newer));
      const stateInOrder = await plans();
      await resetBilling();
      const reversed = pair('b');
      await post(reversed.newer, sign(reversed.newer));
      const late = await post(reversed.older, sign(reversed.older));
      const stateReversed = await plans();
      report.add('out-of-order pair: same state in both orders',
        stateInOrder.globex === 'paid' && stateReversed.globex === 'paid', `in order: ${stateInOrder.globex}, reversed: ${stateReversed.globex}`);
      report.add('late older event is recorded but stale', late.body.result === 'stale', String(late.body.result));

      // --- 3d. equal timestamps: greater event id wins, in either order ----------
      const tie = async (first: 'a' | 'b') => {
        await resetBilling();
        const a = event({ id: `evt_tie_a_${first}`, company: 'acme', sub: 'sub_t_tie', status: 'canceled', created: now });
        const b = event({ id: `evt_tie_b_${first}`, company: 'acme', sub: 'sub_t_tie', status: 'active', created: now });
        for (const body of first === 'a' ? [a, b] : [b, a]) await post(body, sign(body));
        return (await plans()).acme;
      };
      const tieAB = await tie('a');
      const tieBA = await tie('b');
      report.add('equal created: greater event id wins, either order', tieAB === 'paid' && tieBA === 'paid', `a,b -> ${tieAB}; b,a -> ${tieBA}`);

      // --- 3e. cancellation ----------------------------------------------------------
      await resetBilling();
      const subscribe = event({ company: 'acme', sub: 'sub_t_cancel', status: 'active', created: now - 10, type: 'customer.subscription.created' });
      await post(subscribe, sign(subscribe));
      const paidBefore = (await plans()).acme;
      // Stripe's deleted event says status "canceled"; we force it either way.
      const cancel = event({ company: 'acme', sub: 'sub_t_cancel', status: 'active', created: now, type: 'customer.subscription.deleted' });
      const cancelRes = await post(cancel, sign(cancel));
      const afterCancel = await plans();
      report.add('cancellation -> free', paidBefore === 'paid' && afterCancel.acme === 'free', `${paidBefore} -> ${afterCancel.acme} (${cancelRes.body.result})`);
      const { data: subRow } = await admin.from('subscriptions').select('status').eq('stripe_subscription_id', 'sub_t_cancel').single();
      report.add('deleted event stores status canceled', subRow?.status === 'canceled', String(subRow?.status));

      // --- 3f. unknown company, unknown type, missing metadata -----------------------
      await resetBilling();
      const before = JSON.stringify(await plans());
      const stranger = event({ company: 'initech', sub: 'sub_t_initech', status: 'active', created: now });
      const s1 = await post(stranger, sign(stranger));
      const unknownType = JSON.stringify({ id: `evt_inv_${now}`, type: 'invoice.paid', created: now, data: { object: { id: 'in_1' } } });
      const s2 = await post(unknownType, sign(unknownType));
      const noMeta = JSON.stringify({ id: `evt_nometa_${now}`, type: 'customer.subscription.updated', created: now, data: { object: { id: 'sub_x', status: 'active' } } });
      const s3 = await post(noMeta, sign(noMeta));
      const after = JSON.stringify(await plans());
      report.add('unknown company -> 200 ignored', s1.status === 200 && s1.body.result === 'ignored', `${s1.status} ${s1.body.result}`);
      report.add('unknown event type -> 200 ignored', s2.status === 200 && s2.body.result === 'ignored', `${s2.status} ${s2.body.result}`);
      report.add('no metadata.company -> 200 ignored', s3.status === 200 && s3.body.result === 'ignored', `${s3.status} ${s3.body.result}`);
      report.add('ignored events changed no plan', before === after, after);
      const { count: subCount } = await admin.from('subscriptions').select('*', { count: 'exact', head: true });
      report.add('ignored events created no subscription', subCount === 0, `${subCount} rows`);

      // --- 3g. 20 identical events in parallel ------------------------------------
      await resetBilling();
      const burst = event({ company: 'globex', sub: 'sub_t_burst', status: 'active', created: now });
      const results = await Promise.all(Array.from({ length: 20 }, () => post(burst, sign(burst))));
      const applied = results.filter((r) => r.body.result === 'applied').length;
      const duplicates = results.filter((r) => r.body.result === 'duplicate').length;
      report.add('20 identical in parallel: all 200', results.every((r) => r.status === 200), [...new Set(results.map((r) => r.status))].join(','));
      report.add('20 identical in parallel: exactly one applied', applied === 1 && duplicates === 19, `${applied} applied, ${duplicates} duplicate`);
      report.add('burst result: globex paid', (await plans()).globex === 'paid');
    },
    { STRIPE_WEBHOOK_SECRET: SECRET },
  );

  // --- 4. recruiters cannot touch billing tables directly ---------------------
  const g = globex.client;
  const blocked = async (label: string, attempt: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    const { data, error } = await attempt;
    const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
    report.add(label, Boolean(error) || rows === 0, error ? error.message : `${rows} row(s)`);
  };
  await blocked('recruiter read subscriptions', g.from('subscriptions').select('*'));
  await blocked('recruiter read stripe_events', g.from('stripe_events').select('*'));
  await blocked('recruiter insert subscription', g.from('subscriptions').insert({ stripe_subscription_id: 'sub_evil', company_id: 'globex', status: 'active', last_event_created: 9e9, last_event_id: 'evt_evil' }).select());
  await blocked('recruiter insert stripe_event', g.from('stripe_events').insert({ event_id: 'evt_evil', type: 'x', created: 1 }).select());
  await blocked('recruiter update subscriptions', g.from('subscriptions').update({ status: 'active' }).neq('status', '').select());
  await blocked('recruiter delete stripe_events', g.from('stripe_events').delete().neq('event_id', '').select());
  await blocked('recruiter rpc apply_stripe_event', g.rpc('apply_stripe_event', {
    p_event_id: 'evt_evil', p_type: 'customer.subscription.created', p_created: 9e9,
    p_subscription_id: 'sub_evil', p_company: 'globex', p_status: 'active' }));
  const { data: gPlan } = await admin.from('companies').select('plan').eq('id', 'globex').single();
  report.add('recruiter attempts left globex plan unchanged', gPlan?.plan === 'paid', String(gPlan?.plan));

  await resetBilling(); // leave both companies on free with empty billing tables
  process.exit(report.print() ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`billing-test: ${err instanceof Error ? err.message : err}`);
  await resetBilling().catch(() => {});
  process.exit(1);
});
