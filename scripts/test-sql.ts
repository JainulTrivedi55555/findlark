// SQL-only check, no model (npm run test:sql). For every brief in
// seed/queries.json and seed/holdout.json, the filters stored with it must make
// search_candidates return exactly expected_ids, in the same order.
//
// Those ids were computed by a plain TypeScript filter in scripts/generate-seed.ts,
// written independently of the SQL, so this compares two implementations of the
// same rules. A failure here is a SQL bug; a failure only in `npm run eval` is a
// model or prompt bug.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/env';
import { Filters } from '../lib/search/schema';
import { findCandidates } from '../lib/search/find';

type Brief = { brief: string; filters: Partial<Filters>; expected_ids: string[] };

async function main() {
  const admin = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const briefs = ['seed/queries.json', 'seed/holdout.json'].flatMap(
    (file) => JSON.parse(readFileSync(file, 'utf8')) as Brief[],
  );

  let failures = 0;
  console.log('expected   got  extra  missing  order  result  brief');
  for (const b of briefs) {
    const { ids } = await findCandidates(admin, Filters.parse(b.filters));
    const got = new Set(ids);
    const expected = new Set(b.expected_ids);
    const extra = ids.filter((id) => !expected.has(id)).length;
    const missing = b.expected_ids.filter((id) => !got.has(id)).length;
    const sameOrder = ids.length === b.expected_ids.length && ids.every((id, i) => id === b.expected_ids[i]);
    const ok = extra === 0 && missing === 0 && sameOrder;
    if (!ok) failures++;
    console.log(
      `${String(expected.size).padStart(8)}  ${String(ids.length).padStart(4)}  ${String(extra).padStart(5)}  ` +
        `${String(missing).padStart(7)}  ${sameOrder ? '  ok ' : ' DIFF'}  ${ok ? 'PASS  ' : 'FAIL  '}  ${b.brief}`,
    );
  }
  console.log(`\n${briefs.length - failures}/${briefs.length} exact`);
  process.exit(failures ? 1 : 0);
}

main();
