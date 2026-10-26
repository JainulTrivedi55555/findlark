import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Page } from '@/components/page';
import { SearchPageSkeleton } from '@/components/search/results-list';
import { SearchResults } from '@/components/search/search-results';

export const metadata: Metadata = { title: 'Results' };

// Results for one search. All data loads on the client through /api (the
// session lives in the browser). Suspense is required for useSearchParams.
export default function SearchResultsPage() {
  return (
    <Suspense
      fallback={
        <Page wide>
          <SearchPageSkeleton />
        </Page>
      }
    >
      <SearchResults />
    </Suspense>
  );
}
