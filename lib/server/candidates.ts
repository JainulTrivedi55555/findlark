import 'server-only';

// The candidate fields every list (search results, shortlists) shows on a card.
export const CARD_COLUMNS =
  'id, full_name, headline, current_title, current_company, current_company_logo_url, role, seniority, ' +
  'years_experience, city, state, country, open_to_work, skills, avatar_url';

export type CandidateRow = {
  id: string;
  full_name: string;
  headline: string;
  current_title: string;
  current_company: string;
  current_company_logo_url: string;
  role: string;
  seniority: string;
  years_experience: number;
  city: string;
  state: string;
  country: string;
  open_to_work: boolean;
  skills: string[];
  avatar_url: string;
};

export type CandidateCard = ReturnType<typeof toCard>;

/** Database row -> the JSON shape the API returns for a candidate card. */
export function toCard(row: CandidateRow) {
  return {
    id: row.id,
    name: row.full_name,
    headline: row.headline,
    title: row.current_title,
    location: { city: row.city, state: row.state, country: row.country },
    years_experience: row.years_experience,
    role: row.role,
    seniority: row.seniority,
    avatar_url: row.avatar_url,
    current_company: { name: row.current_company, logo_url: row.current_company_logo_url },
    skills: row.skills,
    open_to_work: row.open_to_work,
  };
}
