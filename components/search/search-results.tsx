'use client';
// The results screen for one search: the brief, how it was understood (chips
// the recruiter can correct), the count, Save search, the ranked cards and
// paging. The page number lives in the URL (?page=N).
//
// Filter edits are staged in `draft` and only run when the recruiter presses
// Apply: POST /api/search/{id}/filters re-runs the SQL on the same search id,
// with no model call and no quota.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Page } from '@/components/page';
import { ApplyBar } from '@/components/search/apply-bar';
import { EmptyResults } from '@/components/search/empty-results';
import { BriefText } from '@/components/search/brief-text';
import { FilterBar } from '@/components/search/filter-bar';
import { REVEAL_START_S } from '@/components/search/filter-chip';
import { Pagination } from '@/components/search/pagination';
import { ResultCount } from '@/components/search/result-count';
import { ResultsList, ResultsSkeleton, SearchPageSkeleton } from '@/components/search/results-list';
import { SaveSearchButton } from '@/components/search/save-search-button';
import { ErrorState, SearchNotFound } from '@/components/search/states';
import { useSearchPage } from '@/components/search/use-search-page';
import { api, ApiClientError } from '@/lib/api-client';
import { fade } from '@/lib/motion';
import { filtersToChips, sameFilters, showingText } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';
import { cn } from '@/lib/utils';

// Longer than the whole reveal (brief, chips, count: under 700 ms).
const REVEAL_MS = 800;

/** ?page=N as a whole number from 1; anything else is page 1. */
function parsePage(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export function SearchResults() {
  const { id } = useParams<{ id: string }>();
  const page = parsePage(useSearchParams().get('page'));
  const router = useRouter();
  const { state, retry, replace } = useSearchPage(id, page);

  // null = no unapplied edits.
  const [draft, setDraft] = useState<Filters | null>(null);
  const [applying, setApplying] = useState(false);
  // First load only: the brief, then the chips one by one, then the count. Off after the sequence.
  const [reveal, setReveal] = useState(true);
  const [activeChip, setActiveChip] = useState<string | null>(null);

  const data = state.status === 'ready' ? state.data : null;

  const ready = state.status === 'ready';
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setReveal(false), REVEAL_MS);
    return () => clearTimeout(t);
  }, [ready]);

  // New page: jump to the top at once (no smooth scroll, so paging never waits).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  // A page past the end (an old link): go to the last page instead.
  useEffect(() => {
    if (data && data.total > 0 && data.results.length === 0 && data.page > data.total_pages) {
      router.replace(`/search/${id}?page=${data.total_pages}`, { scroll: false });
    }
  }, [data, id, router]);

  async function apply(next: Filters) {
    setApplying(true);
    try {
      const res = await api.updateFilters(id, next);
      replace(res);
      setDraft(null);
      if (page !== 1) router.replace(`/search/${id}`, { scroll: false });
    } catch (err) {
      if (!(err instanceof ApiClientError && err.status === 401)) {
        toast.error('Could not apply the filters', { description: err instanceof Error ? err.message : undefined });
      }
    } finally {
      setApplying(false);
    }
  }

  if (state.status === 'loading') return <Page wide><SearchPageSkeleton /></Page>;
  if (state.status === 'notfound') return <Page wide><SearchNotFound /></Page>;
  if (state.status === 'error') return <Page wide><ErrorState error={state.error} onRetry={retry} /></Page>;

  const { data: result, pageLoading, version } = state;
  const applied = result.filters;
  const filters = draft ?? applied;
  const dirty = draft !== null && !sameFilters(draft, applied);
  const matchSkills = new Set([...applied.skills, ...applied.skills_any]);

  return (
    // Extra bottom space while the Apply bar floats over the end of the page.
    <Page wide className={cn(dirty && 'pb-36 sm:pb-32')}>
      <motion.div {...fade}>
        <Link
          href="/"
          className="-ml-1 inline-flex h-11 items-center gap-1.5 rounded-md px-1 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-8"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          New search
        </Link>
        <h1 className="mt-1 text-xl leading-snug font-semibold tracking-tight text-balance break-words sm:mt-2 sm:text-2xl">
          <BriefText brief={result.brief} chips={filtersToChips(filters)} activeChip={activeChip} />
        </h1>

        <section aria-labelledby="understood-as" className="mt-6">
          <h2 id="understood-as" className="mb-2.5 text-[12px] font-medium tracking-wide text-muted-foreground uppercase">
            Understood as
          </h2>
          <FilterBar filters={filters} onChange={setDraft} reveal={reveal} onActiveChip={setActiveChip} />
        </section>

        <div className="mt-8 mb-4 flex items-center justify-between gap-3">
          <ResultCount
            total={result.total}
            busyText={applying ? 'Updating results…' : null}
            firstLoad={reveal}
            delay={Math.min(0.3, REVEAL_START_S + 0.04 * filtersToChips(filters).length)}
          />
          <SaveSearchButton brief={result.brief} filters={applied} />
        </div>
      </motion.div>

      <div aria-busy={pageLoading || applying}>
        {pageLoading ? (
          <ResultsSkeleton />
        ) : result.total === 0 ? (
          <EmptyResults filters={applied} reason={result.reason} busy={applying} onApply={apply} />
        ) : (
          <ResultsList
            key={version}
            results={result.results}
            matchSkills={matchSkills}
            firstRank={(result.page - 1) * result.page_size + 1}
            searchId={id}
            page={result.page}
          />
        )}
      </div>

      {result.total > 0 && (
        <>
          <p className="mt-6 mb-3 text-center text-[13px] text-muted-foreground" aria-live="polite">
            {showingText(result.page, result.page_size, result.total)}
          </p>
          <Pagination
            searchId={id}
            page={result.page}
            totalPages={result.total_pages}
            className={cn(
              // Sticky above the phone bottom nav, unless the Apply bar is there.
              !dirty &&
                'max-sm:sticky max-sm:bottom-[calc(56px+env(safe-area-inset-bottom))] max-sm:z-20 max-sm:-mx-4 max-sm:border-t max-sm:bg-background max-sm:px-4 max-sm:py-2',
            )}
          />
        </>
      )}

      <ApplyBar
        visible={dirty}
        applying={applying}
        onApply={() => draft && void apply(draft)}
        onReset={() => setDraft(null)}
      />
    </Page>
  );
}
