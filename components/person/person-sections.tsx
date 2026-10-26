'use client';
// The three sections of the candidate page: experience (a vertical timeline),
// education and skills.
import { CompanyLogo } from '@/components/avatar';
import type { Education, Experience } from '@/lib/api-types';
import { cn } from '@/lib/utils';

export function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-4 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

/** "2021 to present", "2018 to 2021", or just "2020" for a single year. */
export function yearsRange(e: Pick<Experience, 'start_year' | 'end_year' | 'is_current'>): string {
  if (e.is_current) return `${e.start_year} to present`;
  if (e.end_year === null || e.end_year === e.start_year) return String(e.start_year);
  return `${e.start_year} to ${e.end_year}`;
}

export function ExperienceTimeline({ items }: { items: Experience[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No work history listed.</p>;
  return (
    <ol className="relative ml-4 space-y-7 border-l pl-8">
      {items.map((e, i) => (
        <li key={`${e.company}-${e.start_year}-${i}`} className="relative">
          {/* The logo sits on the line; its card background hides the line behind it. */}
          <CompanyLogo
            src={e.company_logo_url}
            name={e.company}
            size={32}
            className="absolute top-0 -left-12 bg-card"
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold">{e.title}</h3>
            <span className="rounded-full bg-muted px-2 py-px text-[12px] font-medium text-muted-foreground">
              {e.company_type === 'startup' ? 'Startup' : 'Enterprise'}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {e.company} · {yearsRange(e)}
          </p>
          {e.description && <p className="mt-2 max-w-prose text-sm leading-relaxed">{e.description}</p>}
        </li>
      ))}
    </ol>
  );
}

export function EducationList({ items }: { items: Education[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No education listed.</p>;
  return (
    <ul className="space-y-4">
      {items.map((e, i) => (
        <li key={`${e.school}-${e.graduation_year}-${i}`}>
          <h3 className="text-[15px] font-semibold">{e.school}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[e.degree, e.field].filter(Boolean).join(', ')} · {e.graduation_year}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function SkillChips({ skills, matchSkills }: { skills: string[]; matchSkills: Set<string> }) {
  if (skills.length === 0) return <p className="text-sm text-muted-foreground">No skills listed.</p>;
  // Skills the search asked for come first.
  const sorted = [...skills].sort((a, b) => Number(matchSkills.has(b)) - Number(matchSkills.has(a)));
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Skills">
      {sorted.map((skill) => {
        const match = matchSkills.has(skill);
        return (
          <li
            key={skill}
            className={cn(
              'rounded-full px-2.5 py-1 text-[13px]',
              match ? 'bg-highlight font-medium text-highlight-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {match && <span className="sr-only">Matches your search: </span>}
            {skill}
          </li>
        );
      })}
    </ul>
  );
}
