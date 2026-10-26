import { requireRecruiter } from '@/lib/server/auth';
import { CARD_COLUMNS, toCard, type CandidateRow } from '@/lib/server/candidates';
import { check, handle, notFound, personParam } from '@/lib/server/http';

type PersonRow = CandidateRow & {
  experiences: {
    title: string; company: string; company_logo_url: string; company_type: string;
    start_year: number; end_year: number | null; is_current: boolean; description: string;
  }[];
  educations: { school: string; degree: string; field: string; graduation_year: number }[];
};

// GET /api/people/{id}: one candidate with experience (newest first) and education,
// plus which of the caller's shortlists already include them.
export const GET = handle<{ id: string }>(async (req, { params }) => {
  const { supabase } = await requireRecruiter(req);
  const personId = personParam((await params).id);

  const [personRes, listsRes] = await Promise.all([
    supabase
      .from('candidates')
      .select(
        `${CARD_COLUMNS}, ` +
          'experiences(position, title, company, company_logo_url, company_type, start_year, end_year, is_current, description), ' +
          'educations(position, school, degree, field, graduation_year)',
      )
      .eq('id', personId)
      // position 0 is the current job; the seed keeps the file's newest-first order.
      .order('position', { referencedTable: 'experiences' })
      .order('position', { referencedTable: 'educations' })
      .maybeSingle(),
    // RLS limits this to the caller's own company's shortlists.
    supabase.from('shortlist_people').select('shortlist_id').eq('candidate_id', personId),
  ]);
  const person = check(personRes, 'read person') as unknown as PersonRow | null;
  if (!person) throw notFound('Person');
  const lists = check(listsRes, 'read person shortlists') as { shortlist_id: string }[];

  return Response.json({
    ...toCard(person),
    experiences: person.experiences.map((e) => ({
      title: e.title, company: e.company, company_logo_url: e.company_logo_url, company_type: e.company_type,
      start_year: e.start_year, end_year: e.end_year, is_current: e.is_current, description: e.description,
    })),
    education: person.educations.map((e) => ({
      school: e.school, degree: e.degree, field: e.field, graduation_year: e.graduation_year,
    })),
    shortlist_ids: lists.map((l) => l.shortlist_id),
  });
});
