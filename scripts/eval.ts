// Search accuracy and speed through the full pipeline (LLM + SQL).
//
//   npm run eval                                  examples + extra, default model
//   npm run eval -- --model claude-haiku-5-5      override the model
//   npm run eval -- --only queries                or --only extra
//   npm run eval -- --only holdout                seed/holdout.json (40 more briefs)
//
// seed/queries.json and seed/holdout.json come from scripts/generate-seed.ts, with
// expected ids computed independently of the SQL. For each: precision, recall,
// F1 for the whole result and precision@20 for page 1.
// eval/extra.json: vague, unanswerable and hostile briefs. Each must return zero
// results or one of its accepted narrow sets, without errors, and no table may
// change row count. Writes eval/latest.json and eval/<model>.json.
//
// Run with --conditions=react-server (the npm script does) so lib/server imports load.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/env';
import { MODEL } from '../lib/server/llm';
import { runSearch, type SearchRun } from '../lib/search/run';
import { findCandidates } from '../lib/search/find';
import { Filters } from '../lib/search/schema';

type Query = { category?: string; brief: string; filters: Partial<Filters>; expected_ids: string[] };
type Extra = { category: string; brief: string; accept: ('zero' | Partial<Filters>)[] };

const args = process.argv.slice(2);
const argValue = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const model = argValue('--model') ?? MODEL;
const only = argValue('--only');

const admin = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  'companies', 'recruiters', 'candidates', 'experiences', 'educations', 'searches', 'search_results',
  'shortlists', 'shortlist_people', 'saved_briefs', 'subscriptions', 'stripe_events',
];

async function rowCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`count ${t}: ${error.message}`);
    counts[t] = count ?? -1;
  }
  return counts;
}

/** Precision/recall with explicit conventions for empty sets (both empty = perfect). */
function score(got: string[], expected: string[]) {
  const exp = new Set(expected);
  const tp = got.filter((id) => exp.has(id)).length;
  const precision = got.length === 0 ? (expected.length === 0 ? 1 : 0) : tp / got.length;
  const recall = expected.length === 0 ? (got.length === 0 ? 1 : 0) : tp / expected.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const page1 = got.slice(0, 20);
  const p20 =
    page1.length === 0 ? (expected.length === 0 ? 1 : 0) : page1.filter((id) => exp.has(id)).length / page1.length;
  return { precision, recall, f1, p20 };
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const f2 = (n: number) => n.toFixed(2);
const ms = (n: number) => `${Math.round(n)}`.padStart(5);

/** Compact view of the filters that are set, for the report. */
function shortFilters(f: Filters): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (k === 'unsupported') continue;
    if (Array.isArray(v) ? v.length : v !== null && v !== false) parts.push(`${k}=${JSON.stringify(v)}`);
  }
  if (f.unsupported.length) parts.push(`unsupported=${JSON.stringify(f.unsupported.map((u) => u.text))}`);
  return parts.join(' ');
}

type Timed = { run: SearchRun | null; totalMs: number; error: string | null };
async function timedRun(brief: string): Promise<Timed> {
  const started = performance.now();
  try {
    const run = await runSearch(admin, brief, { model });
    return { run, totalMs: performance.now() - started, error: null };
  } catch (err) {
    return { run: null, totalMs: performance.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

async function evalQueries(file: string) {
  const queries = JSON.parse(readFileSync(file, 'utf8')) as Query[];
  const rows = [];
  console.log(`\n== ${file} (${queries.length} briefs, model ${model}) ==`);
  console.log('    P     R    F1   P@20  got  exp   llm ms  total ms  brief');
  for (const q of queries) {
    const t = await timedRun(q.brief);
    const got = t.run?.ids ?? [];
    const s = score(got, q.expected_ids);
    rows.push({ brief: q.brief, expected: q.expected_ids.length, got: got.length, ...s, totalMs: t.totalMs,
      llmMs: t.run?.llm.latencyMs ?? null, usage: t.run?.llm.usage ?? null, error: t.error,
      filters: t.run ? shortFilters(t.run.filters) : null, reason: t.run?.reason ?? null });
    console.log(
      `${f2(s.precision).padStart(5)} ${f2(s.recall).padStart(5)} ${f2(s.f1).padStart(5)} ${f2(s.p20).padStart(5)} ` +
        `${String(got.length).padStart(4)} ${String(q.expected_ids.length).padStart(4)}  ${t.run ? ms(t.run.llm.latencyMs) : '  err'}` +
        `     ${ms(t.totalMs)}  ${q.brief}`,
    );
    console.log(`      ${t.error ? `ERROR ${t.error}` : shortFilters(t.run!.filters)}`);
    if (s.f1 < 1) console.log(`      expected ${shortFilters(Filters.parse(q.filters))}`);
  }
  const avg = {
    precision: mean(rows.map((r) => r.precision)),
    recall: mean(rows.map((r) => r.recall)),
    f1: mean(rows.map((r) => r.f1)),
    p20: mean(rows.map((r) => r.p20)),
  };
  console.log(`${f2(avg.precision).padStart(5)} ${f2(avg.recall).padStart(5)} ${f2(avg.f1).padStart(5)} ${f2(avg.p20).padStart(5)}  <- average`);
  return { rows, avg };
}

async function evalExtra() {
  const extras = JSON.parse(readFileSync('eval/extra.json', 'utf8')) as Extra[];
  const before = await rowCounts();
  const rows = [];
  console.log(`\n== eval/extra.json (${extras.length} briefs, model ${model}) ==`);
  console.log('result  got  llm ms  category      brief');
  for (const e of extras) {
    const t = await timedRun(e.brief);
    const got = t.run?.ids ?? [];
    let ok = false;
    if (!t.error) {
      for (const a of e.accept) {
        if (a === 'zero') ok ||= got.length === 0;
        else {
          const { ids } = await findCandidates(admin, Filters.parse(a));
          ok ||= ids.length === got.length && ids.every((id, i) => id === got[i]);
        }
      }
    }
    rows.push({ ...e, ok, got: got.length, totalMs: t.totalMs, llmMs: t.run?.llm.latencyMs ?? null,
      usage: t.run?.llm.usage ?? null, error: t.error, filters: t.run ? shortFilters(t.run.filters) : null,
      reason: t.run?.reason ?? null });
    console.log(`${ok ? 'PASS  ' : 'FAIL  '}  ${String(got.length).padStart(4)}  ${t.run ? ms(t.run.llm.latencyMs) : '  err'}  ${e.category.padEnd(12)}  ${e.brief}`);
    console.log(`        ${t.error ? `ERROR ${t.error}` : `${shortFilters(t.run!.filters)}${t.run!.reason ? `  | reason: ${t.run!.reason}` : ''}`}`);
  }
  const after = await rowCounts();
  const changed = TABLES.filter((t) => before[t] !== after[t]);
  console.log(`row counts unchanged: ${changed.length === 0 ? 'yes' : `NO (${changed.join(', ')})`}`);
  return { rows, passed: rows.filter((r) => r.ok).length, total: rows.length, rowCountsUnchanged: changed.length === 0, before, after };
}


async function main() {
  const started = performance.now();
  const holdout = only === 'holdout' ? await evalQueries('seed/holdout.json') : null;
  const queries = only === 'extra' || holdout ? null : await evalQueries('seed/queries.json');
  const extra = only === 'queries' || holdout ? null : await evalExtra();
  const totalMs = performance.now() - started;

  const all = [...(queries?.rows ?? []), ...(extra?.rows ?? []), ...(holdout?.rows ?? [])];
  const llmMs = all.map((r) => r.llmMs).filter((n): n is number => n !== null);
  const pipelineMs = all.map((r) => r.totalMs);
  const usages = all.map((r) => r.usage).filter((u) => u !== null);
  const speed = {
    llm_p50_ms: percentile(llmMs, 50),
    llm_p95_ms: percentile(llmMs, 95),
    pipeline_p50_ms: percentile(pipelineMs, 50),
    pipeline_p95_ms: percentile(pipelineMs, 95),
    total_eval_ms: totalMs,
    calls: llmMs.length,
  };
  const tokens = {
    avg_input: mean(usages.map((u) => u!.input_tokens)),
    avg_output: mean(usages.map((u) => u!.output_tokens)),
    avg_cache_read: mean(usages.map((u) => u!.cache_read_input_tokens)),
    avg_cache_write: mean(usages.map((u) => u!.cache_creation_input_tokens)),
  };

  console.log(`\n== summary (${model}) ==`);
  if (queries) console.log(`queries: P ${f2(queries.avg.precision)}  R ${f2(queries.avg.recall)}  F1 ${f2(queries.avg.f1)}  P@20 ${f2(queries.avg.p20)}`);
  if (extra) console.log(`extra: ${extra.passed}/${extra.total} passed, row counts unchanged: ${extra.rowCountsUnchanged}`);
  if (holdout) console.log(`holdout: P ${f2(holdout.avg.precision)}  R ${f2(holdout.avg.recall)}  F1 ${f2(holdout.avg.f1)}  P@20 ${f2(holdout.avg.p20)}`);
  console.log(`LLM latency p50 ${Math.round(speed.llm_p50_ms)} ms, p95 ${Math.round(speed.llm_p95_ms)} ms; ` +
    `pipeline p50 ${Math.round(speed.pipeline_p50_ms)} ms, p95 ${Math.round(speed.pipeline_p95_ms)} ms; total ${(totalMs / 1000).toFixed(1)} s`);
  console.log(`avg tokens: input ${tokens.avg_input.toFixed(0)}, output ${tokens.avg_output.toFixed(0)}, ` +
    `cache read ${tokens.avg_cache_read.toFixed(0)}, cache write ${tokens.avg_cache_write.toFixed(0)}`);

  const report = { model, ran_at: new Date().toISOString(), queries, extra, holdout, speed, tokens };
  mkdirSync('eval', { recursive: true });
  if (holdout) {
    // Kept apart so a holdout run never replaces the main eval results.
    writeFileSync(`eval/holdout-${model}.json`, JSON.stringify(report, null, 2) + '\n');
  } else {
    writeFileSync('eval/latest.json', JSON.stringify(report, null, 2) + '\n');
    writeFileSync(`eval/${model}.json`, JSON.stringify(report, null, 2) + '\n');
  }

  const failed =
    (holdout ? holdout.rows.some((r) => r.error) : false) ||
    (queries ? queries.rows.some((r) => r.error) : false) ||
    (extra ? extra.passed !== extra.total || !extra.rowCountsUnchanged : false);
  process.exit(failed ? 1 : 0);
}

main();
