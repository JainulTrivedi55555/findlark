// Shared helpers for the API test scripts.
//
// Server: if TEST_BASE_URL is set (e.g. http://localhost:3000 with `make dev`
// running), tests use it. Otherwise they start their own production server with
// `next start` on port 3100 (run `npm run build` first; `make test` does) and
// stop it at the end. The production server gives realistic timings; dev mode
// compiles each route on first hit.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

const OWN_PORT = 3100;

async function isUp(base: string): Promise<boolean> {
  try {
    await fetch(`${base}/api/plan`, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/** env: extra environment for the server we start (ignored with TEST_BASE_URL). */
export async function withServer<T>(fn: (base: string) => Promise<T>, env: Record<string, string> = {}): Promise<T> {
  const external = process.env.TEST_BASE_URL;
  if (external) {
    if (!(await isUp(external))) throw new Error(`TEST_BASE_URL ${external} is not responding`);
    return fn(external.replace(/\/$/, ''));
  }

  if (!existsSync('.next/BUILD_ID')) {
    throw new Error('No production build found. Run `npm run build` first, or set TEST_BASE_URL.');
  }
  const base = `http://localhost:${OWN_PORT}`;
  if (await isUp(base)) throw new Error(`Port ${OWN_PORT} is already in use; stop that process or set TEST_BASE_URL.`);

  const child: ChildProcess = spawn('npx', ['next', 'start', '--port', String(OWN_PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env }, // process env wins over .env.local in Next.js
    detached: true, // own process group, so we can stop npx and next together
  });
  let output = '';
  const echo = process.env.TEST_SERVER_LOG === '1'; // show the server's own log lines
  child.stdout?.on('data', (d) => {
    output += d;
    if (echo) process.stdout.write(`[server] ${d}`);
  });
  child.stderr?.on('data', (d) => {
    output += d;
    if (echo) process.stdout.write(`[server] ${d}`);
  });

  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  try {
    const deadline = Date.now() + 30_000;
    while (!(await isUp(base))) {
      if (Date.now() > deadline || child.exitCode !== null) {
        throw new Error(`next start did not come up on ${base}:\n${output.slice(-2000)}`);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return await fn(base);
  } finally {
    stop();
  }
}

export const PASSWORD = 'findlark-demo';
const NO_SESSION = { persistSession: false, autoRefreshToken: false };

export function adminClient() {
  return createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), { auth: NO_SESSION });
}

/** Signs in a seeded recruiter and returns their client and access token. */
export async function signIn(email: string) {
  const client = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: NO_SESSION,
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`sign in as ${email} failed: ${error?.message}`);
  return { client, token: data.session.access_token, userId: data.user.id };
}

export type ApiResult = { status: number; body: any; ms: number; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Calls our API with an optional bearer token and returns status, parsed body and time. */
export async function api(
  base: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined || options.rawBody !== undefined) headers['content-type'] = 'application/json';
  const started = performance.now();
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.rawBody ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  const text = await res.text();
  const ms = performance.now() - started;
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text (e.g. an HTML error page) so the test can report it
  }
  return { status: res.status, body, ms, headers: res.headers };
}

export const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

const TABLES = [
  'companies', 'recruiters', 'candidates', 'experiences', 'educations', 'searches', 'search_results',
  'shortlists', 'shortlist_people', 'saved_briefs', 'subscriptions', 'stripe_events',
];

export async function rowCounts(): Promise<Record<string, number>> {
  const admin = adminClient();
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${t}: ${error.message}`);
    counts[t] = count ?? -1;
  }
  return counts;
}

/** Collects pass/fail rows and prints them as a table. */
export class Report {
  rows: { check: string; ok: boolean; detail: string }[] = [];
  add(check: string, ok: boolean, detail = '') {
    this.rows.push({ check, ok, detail });
  }
  print(): number {
    const width = Math.max(...this.rows.map((r) => r.check.length), 5);
    console.log(`\n${'check'.padEnd(width)}  result  detail`);
    console.log(`${'-'.repeat(width)}  ------  ------`);
    for (const r of this.rows) console.log(`${r.check.padEnd(width)}  ${r.ok ? 'PASS  ' : 'FAIL  '}  ${r.detail.slice(0, 90)}`);
    const failed = this.rows.filter((r) => !r.ok).length;
    console.log(`\n${this.rows.length - failed}/${this.rows.length} passed${failed ? `, ${failed} FAILED` : ''}`);
    return failed;
  }
}
