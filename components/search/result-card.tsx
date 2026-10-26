'use client';
// One candidate in the results. The whole card opens the profile (the name is
// the link, stretched over the card); `actions` sits above that link so its
// buttons stay separately clickable (the shortlist button goes there).
import type { ReactNode } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Avatar, CompanyLogo } from '@/components/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { CandidateCard } from '@/lib/api-types';
import { yearsShort } from '@/lib/format';
import { personHref } from '@/lib/person-links';
import { cn } from '@/lib/utils';

const MAX_SKILLS = 5;

type Props = {
  person: CandidateCard;
  /** Skills from the applied filters, highlighted and shown first. */
  matchSkills: Set<string>;
  actions?: ReactNode;
  /** Where the name links to. Default: the candidate page. */
  href?: string;
};

export function ResultCard({ person, matchSkills, actions, href }: Props) {
  // Matching skills first, so the reason someone is here is always visible.
  const skills = [...person.skills].sort((a, b) => Number(matchSkills.has(b)) - Number(matchSkills.has(a)));
  const shown = skills.slice(0, MAX_SKILLS);
  const extra = skills.length - shown.length;
  const place = [person.location.city, person.location.state].filter(Boolean).join(', ');

  return (
    <article className="lift group relative flex gap-3.5 rounded-xl border bg-card p-4 sm:gap-4 sm:p-5">
      <Avatar src={person.avatar_url} name={person.name} size={48} className="mt-0.5 self-start ring-2 ring-transparent transition-shadow group-hover:ring-primary/25" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold">
              <Link
                href={href ?? personHref(person.id)}
                className="outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-primary focus-visible:after:ring-3 focus-visible:after:ring-ring/30"
              >
                {person.name}
              </Link>
              <span className="rounded-full bg-muted px-2 py-px text-[12px] font-medium text-muted-foreground capitalize">
                {person.seniority}
              </span>
              {person.open_to_work && (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[12px] font-medium text-foreground">
                  <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
                  Open to work
                </span>
              )}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-1">{person.headline}</p>
          </div>
          {actions && <div className="relative z-10 -mt-1 -mr-1 shrink-0">{actions}</div>}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <CompanyLogo src={person.current_company.logo_url} name={person.current_company.name} size={20} />
            {person.current_company.name}
          </span>
          {place && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {place}
            </span>
          )}
          <span>{yearsShort(person.years_experience)} experience</span>
        </div>

        {shown.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
            {shown.map((skill) => {
              const match = matchSkills.has(skill);
              return (
                <li
                  key={skill}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[12px]',
                    // The only coloured element on a card: why this person matched.
                    match ? 'bg-highlight font-medium text-highlight-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {match && <span className="sr-only">Matches filter: </span>}
                  {skill}
                </li>
              );
            })}
            {extra > 0 && (
              <li className="px-1 py-0.5 text-[12px] text-muted-foreground" aria-label={`${extra} more skills`}>
                +{extra}
              </li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ResultCardSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-xl border bg-card p-4 sm:gap-4 sm:p-5" aria-hidden>
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-3.5 w-1/2" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
    </div>
  );
}
