// Puts acme and globex back on the free plan with 0 searches used.
// Dev convenience only (make reset-quota). Uses the secret key.
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/env';

const admin = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { error } = await admin
    .from('companies')
    .update({ plan: 'free', searches_used: 0 })
    .in('id', ['acme', 'globex']);
  if (error) {
    console.error(`reset-quota failed: ${error.message}`);
    process.exit(1);
  }
  console.log('reset-quota: acme and globex are free with 0 searches used.');
}

main();
