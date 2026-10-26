// Seeds the local database. Idempotent: safe to run any number of times,
// and must be re-run after `supabase db reset` (which deletes auth users).
//
// 1. companies acme and globex (existing plan / searches_used are left alone)
// 2. one confirmed auth user per company, linked in recruiters
// 3. all 5,000 candidates from seed/candidates.json (scripts/generate-seed.ts),
//    with experiences and education, upserted in batches
//
// Uses the secret key: seeding is one of the few allowed uses.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './lib/env';
import { loadCandidates, type Candidate } from './lib/candidates';

const PASSWORD = 'findlark-demo';
const COMPANIES = [
  { id: 'acme', name: 'Acme', email: 'recruiter@acme.test' },
  { id: 'globex', name: 'Globex', email: 'recruiter@globex.test' },
];
const BATCH = 1000;

const admin = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(step: string, error: { message: string }): never {
  console.error(`seed: ${step} failed: ${error.message}`);
  process.exit(1);
}

async function seedCompanies() {
  // ignoreDuplicates: never reset plan or searches_used on a re-run.
  const { error } = await admin
    .from('companies')
    .upsert(COMPANIES.map(({ id, name }) => ({ id, name })), { onConflict: 'id', ignoreDuplicates: true });
  if (error) fail('companies', error);
}

async function findUserId(client: SupabaseClient, email: string): Promise<string | null> {
  // Local projects have a handful of users, so one page is plenty.
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) fail('listUsers', error);
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function seedRecruiters() {
  for (const company of COMPANIES) {
    let userId = await findUserId(admin, company.email);
    if (userId) {
      // Make sure a re-run always leaves a known password and a confirmed email.
      const { error } = await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
      if (error) fail(`update user ${company.email}`, error);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: company.email,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) fail(`create user ${company.email}`, error);
      userId = data.user.id;
    }
    const { error } = await admin
      .from('recruiters')
      .upsert({ user_id: userId, company_id: company.id }, { onConflict: 'user_id' });
    if (error) fail(`recruiter ${company.email}`, error);
  }
}

function candidateRow(c: Candidate) {
  return {
    id: c.id,
    full_name: c.full_name,
    headline: c.headline,
    current_title: c.current_title,
    current_company: c.current_company,
    current_company_logo_url: c.current_company_logo_url,
    role: c.role,
    seniority: c.seniority,
    years_experience: c.years_experience,
    city: c.location.city,
    state: c.location.state,
    country: c.location.country,
    open_to_work: c.open_to_work,
    skills: c.skills,
    avatar_url: c.avatar_url,
  };
}

async function upsertInBatches(table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + BATCH), { onConflict });
    if (error) fail(`${table} rows ${i}-${i + BATCH}`, error);
  }
}

async function seedCandidates() {
  const candidates = loadCandidates();

  // (candidate_id, position) is the natural key, so upserts are idempotent.
  // position keeps the file's order: 0 is the newest (current) job.
  const experiences = candidates.flatMap((c) =>
    c.experiences.map((e, position) => ({ candidate_id: c.id, position, ...e })),
  );
  const educations = candidates.flatMap((c) =>
    c.education.map((e, position) => ({ candidate_id: c.id, position, ...e })),
  );

  await upsertInBatches('candidates', candidates.map(candidateRow), 'id');
  await upsertInBatches('experiences', experiences, 'candidate_id,position');
  await upsertInBatches('educations', educations, 'candidate_id,position');

  return { candidates: candidates.length, experiences: experiences.length, educations: educations.length };
}

async function main() {
  const started = Date.now();
  await seedCompanies();
  await seedRecruiters();
  const counts = await seedCandidates();
  console.log(
    `seed: 2 companies, 2 recruiters, ${counts.candidates} candidates, ${counts.experiences} experiences, ` +
      `${counts.educations} educations (${Date.now() - started} ms)`,
  );
}

main();
