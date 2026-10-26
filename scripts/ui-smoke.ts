// UI smoke test (npm run test:ui-smoke, after npm run build).
//
// Starts `next start` on port 3100 (or uses TEST_BASE_URL), signs in as acme
// through Supabase and checks the token works on our API, then fetches the
// pages a browser loads first (/login and /) plus every script they reference,
// and checks that:
//   - each page returns 200
//   - no page or script contains a server-only value: the secret key, the
//     model key, the webhook secret, or a key-shaped marker
// The Supabase URL and publishable key are expected in the bundle (the browser
// needs them to sign in) and are not flagged.
import { requireEnv } from './lib/env';
import { api, Report, signIn, withServer } from './lib/server';

const PAGES = ['/login', '/'];

const SECRET_NAMES = ['SUPABASE_SECRET_KEY', 'ANTHROPIC_API_KEY', 'STRIPE_WEBHOOK_SECRET'];
const MARKERS: { name: string; pattern: RegExp }[] = [
  { name: 'sb_secret_ key', pattern: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: 'sk-ant- key', pattern: /sk-ant-[A-Za-z0-9_-]{16,}/ },
  { name: 'whsec_ secret', pattern: /whsec_[A-Za-z0-9+/=_-]{8,}/ },
  { name: 'service_role', pattern: /service_role/ },
  // Server code that must never be bundled for the browser.
  { name: 'server module', pattern: /lib\/server\/|createAdminClient|SUPABASE_SECRET_KEY|ANTHROPIC_API_KEY/ },
];

function findLeaks(text: string): string[] {
  const found: string[] = [];
  for (const name of SECRET_NAMES) {
    const value = process.env[name];
    if (value && value.length >= 12 && text.includes(value)) found.push(`value of ${name}`);
  }
  for (const m of MARKERS) if (m.pattern.test(text)) found.push(m.name);
  return found;
}

function scriptUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const match of html.matchAll(/["'](\/_next\/static\/[^"'\s]+?\.js)["']/g)) urls.add(match[1]);
  return [...urls];
}

async function main() {
  requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const report = new Report();

  const failed = await withServer(async (base) => {
    const { token } = await signIn('recruiter@acme.test');
    report.add('sign in as acme', Boolean(token), 'Supabase email + password');

    const plan = await api(base, 'GET', '/api/plan', { token });
    report.add('API accepts the token', plan.status === 200, `GET /api/plan -> ${plan.status}`);

    const scripts = new Set<string>();
    for (const path of PAGES) {
      const res = await fetch(`${base}${path}`);
      const html = await res.text();
      report.add(`GET ${path} is 200`, res.status === 200, `${res.status}, ${html.length} bytes`);
      const leaks = findLeaks(html);
      report.add(`${path} has no server-only strings`, leaks.length === 0, leaks.join(', ') || 'clean');
      scriptUrls(html).forEach((u) => scripts.add(u));
    }

    const leaky: string[] = [];
    for (const url of scripts) {
      const text = await (await fetch(`${base}${url}`)).text();
      const leaks = findLeaks(text);
      if (leaks.length) leaky.push(`${url}: ${leaks.join(', ')}`);
    }
    report.add('page scripts have no server-only strings', scripts.size > 0 && leaky.length === 0,
      leaky.join('; ') || `${scripts.size} scripts clean`);

    return report.print();
  });

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`ui-smoke failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
