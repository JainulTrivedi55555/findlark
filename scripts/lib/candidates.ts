// Shape of seed/candidates.json (written by scripts/generate-seed.ts; see docs/data-notes.md).
// Parsed with zod so a surprise in the data fails loudly at seed time.
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Experience = z.object({
  title: z.string(),
  company: z.string(),
  company_logo_url: z.string().startsWith('/logos/'), // served from public/
  company_type: z.enum(['startup', 'enterprise']),
  start_year: z.number().int(),
  end_year: z.number().int().nullable(),
  description: z.string(),
});

const Education = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  graduation_year: z.number().int(),
});

const Candidate = z.object({
  id: z.string().regex(/^cand_\d+$/),
  full_name: z.string(),
  avatar_url: z.string().startsWith('data:image/svg+xml,'), // inline SVG, no image host
  headline: z.string(),
  current_title: z.string(),
  current_company: z.string(),
  current_company_logo_url: z.string().startsWith('/logos/'),
  role: z.string(),
  seniority: z.enum(['junior', 'mid', 'senior', 'staff']),
  years_experience: z.number().int(),
  location: z.object({ city: z.string(), state: z.string(), country: z.string() }),
  open_to_work: z.boolean(),
  skills: z.array(z.string()),
  experiences: z.array(Experience),
  education: z.array(Education),
});

export type Candidate = z.infer<typeof Candidate>;

export function loadCandidates(path = 'seed/candidates.json'): Candidate[] {
  return z.array(Candidate).parse(JSON.parse(readFileSync(path, 'utf8')));
}
