// Writes the local Supabase URL and keys into .env.local.
//
// Reads `npx supabase status -o env` and only adds or updates the three
// Supabase variables below. Every other line in .env.local (including
// ANTHROPIC_API_KEY and STRIPE_WEBHOOK_SECRET) is kept exactly as it is.
// Never prints a key value.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = '.env.local';

// Our variable name -> the names `supabase status -o env` may print (CLI 2.119
// prints PUBLISHABLE_KEY / SECRET_KEY; older versions only ANON_KEY / SERVICE_ROLE_KEY).
// Only the URL and the publishable key are NEXT_PUBLIC_: they are safe in the browser.
// The secret key bypasses RLS and must never be NEXT_PUBLIC_.
const MAPPING: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ['API_URL'],
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ['PUBLISHABLE_KEY', 'ANON_KEY'],
  SUPABASE_SECRET_KEY: ['SECRET_KEY', 'SERVICE_ROLE_KEY'],
};

function readStatus(): Record<string, string> {
  let out: string;
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // stderr has an update notice we don't need
    });
  } catch {
    console.error('write-env: `npx supabase status` failed. Is Supabase running? Try `npx supabase start`.');
    process.exit(1);
  }
  const values: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    values[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return values;
}

function main() {
  const status = readStatus();

  const wanted: Record<string, string> = {};
  for (const [ourName, sourceNames] of Object.entries(MAPPING)) {
    const source = sourceNames.find((n) => status[n]);
    if (!source) {
      console.error(`write-env: supabase status did not print any of ${sourceNames.join(', ')}.`);
      process.exit(1);
    }
    wanted[ourName] = status[source];
  }

  const original = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const lines = original === '' ? [] : original.replace(/\n$/, '').split('\n');
  const seen = new Set<string>();

  // Replace managed keys in place; leave every other line untouched.
  const updated = lines.map((line) => {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!m || !(m[1] in wanted)) return line;
    seen.add(m[1]);
    return `${m[1]}=${wanted[m[1]]}`;
  });

  for (const name of Object.keys(wanted)) {
    if (!seen.has(name)) updated.push(`${name}=${wanted[name]}`);
  }

  writeFileSync(ENV_FILE, updated.join('\n') + '\n', { mode: 0o600 });
  console.log(`write-env: wrote ${Object.keys(wanted).join(', ')} to ${ENV_FILE} (values not shown).`);

  for (const name of ['ANTHROPIC_API_KEY', 'STRIPE_WEBHOOK_SECRET']) {
    const inFile = updated.some((l) => l.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*\\S`)));
    if (!inFile && !process.env[name]) {
      console.log(`write-env: note: ${name} is not set in ${ENV_FILE} or the environment.`);
    }
  }
}

main();
