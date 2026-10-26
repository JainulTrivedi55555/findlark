'use client';
// The candidate page: header, experience, education, skills. Phones get one
// column and a sticky Shortlist bar above the bottom nav; desktop puts the
// button in the header. Sections fade in 30 ms apart.
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Avatar } from '@/components/avatar';
import { Page } from '@/components/page';
import { usePerson } from '@/components/person/use-person';
import { EducationList, ExperienceTimeline, SectionTitle, SkillChips } from '@/components/person/person-sections';
import { ErrorState, StateMessage } from '@/components/search/states';
import { ShortlistButton } from '@/components/shortlist/shortlist-button';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Person } from '@/lib/api-types';
import { yearsShort } from '@/lib/format';
import { transition } from '@/lib/motion';
import { safeBackPath, safeSearchId } from '@/lib/person-links';
import { useIsDesktop } from '@/lib/use-media-query';

export function PersonView() {
  const { id } = useParams<{ id: string }>();
  const query = useSearchParams();
  const searchId = safeSearchId(query.get('search'));
  const back = safeBackPath(query.get('from'));
  const { state, retry } = usePerson(id, searchId);

  const backLink = (
    <Link
      href={back ?? '/'}
      className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-8"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      {back ? 'Back to results' : 'Back to search'}
    </Link>
  );

  if (state.status === 'loading') return <Page>{backLink}<PersonSkeleton /></Page>;
  if (state.status === 'notfound') {
    return (
      <Page>
        {backLink}
        <StateMessage
          className="mt-4"
          art="empty"
          title="We can’t find that person"
          actions={<Link href="/" className={buttonVariants()}>Start a new search</Link>}
        >
          The link may be incomplete.
        </StateMessage>
      </Page>
    );
  }
  if (state.status === 'error') return <Page>{backLink}<div className="mt-4"><ErrorState error={state.error} onRetry={retry} /></div></Page>;

  return <PersonBody person={state.person} matchSkills={state.matchSkills} backLink={backLink} />;
}

function PersonBody({ person, matchSkills, backLink }: { person: Person; matchSkills: Set<string>; backLink: React.ReactNode }) {
  const reduce = useReducedMotion();
  const desktop = useIsDesktop();
  const place = [person.location.city, person.location.state].filter(Boolean).join(', ');

  // Fade in, 30 ms apart.
  const section = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...transition, delay: i * 0.03 },
  });

  const shortlist = (
    <ShortlistButton personId={person.id} personName={person.name} variant="labelled" className="max-sm:w-full" />
  );

  return (
    // Extra bottom space on phones for the sticky Shortlist bar.
    <Page className="max-sm:pb-28">
      {backLink}

      {/* One near-opaque card, so the profile never sits straight on the backdrop. */}
      <div className="mt-3 rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <motion.header {...section(0)} className="flex items-start gap-4 sm:gap-5">
          <Avatar src={person.avatar_url} name={person.name} size={desktop ? 96 : 72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{person.name}</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">{person.headline}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
              {place && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" aria-hidden />
                  {place}
                </span>
              )}
              <span>{yearsShort(person.years_experience)} experience</span>
              <span className="rounded-full bg-muted px-2 py-px text-[12px] font-medium capitalize">{person.seniority}</span>
              {person.open_to_work && (
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[12px] font-medium text-foreground">
                  <span className="size-1.5 rounded-full bg-foreground" aria-hidden />
                  Open to work
                </span>
              )}
            </div>
          </div>
          {desktop && <div className="shrink-0">{shortlist}</div>}
        </motion.header>

        <motion.section {...section(1)} aria-labelledby="experience-heading" className="mt-10">
          <SectionTitle id="experience-heading">Experience</SectionTitle>
          <ExperienceTimeline items={person.experiences} />
        </motion.section>

        <motion.section {...section(2)} aria-labelledby="education-heading" className="mt-10">
          <SectionTitle id="education-heading">Education</SectionTitle>
          <EducationList items={person.education} />
        </motion.section>

        <motion.section {...section(3)} aria-labelledby="skills-heading" className="mt-10">
          <SectionTitle id="skills-heading">Skills</SectionTitle>
          <SkillChips skills={person.skills} matchSkills={matchSkills} />
        </motion.section>
      </div>

      {!desktop && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t bg-background px-[max(1rem,env(safe-area-inset-left))] py-2 sm:hidden">
          {shortlist}
        </div>
      )}
    </Page>
  );
}

/** The page's shape while it loads. */
function PersonSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading candidate">
      <div className="mt-2 flex items-start gap-4 sm:gap-5">
        <Skeleton className="size-[72px] shrink-0 rounded-full sm:size-24" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-10 mb-5 h-3.5 w-24" />
      <div className="ml-4 space-y-7 border-l pl-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-full max-w-prose" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-10 mb-4 h-3.5 w-24" />
      <Skeleton className="h-10 w-64" />
    </div>
  );
}
