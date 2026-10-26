'use client';
// Home: the brief box, three example briefs, recent searches and saved searches.
import { useRef, useState } from 'react';
import { Page } from '@/components/page';
import { BriefForm, type BriefFormHandle } from '@/components/search/brief-form';
import { RecentSearches } from '@/components/search/recent-searches';
import { SavedSearches } from '@/components/search/saved-searches';
import { useRunSearch } from '@/components/search/use-run-search';
import { useBusyBackdrop } from '@/lib/backdrop-store';

// Real briefs from the data's vocabulary. Each returns people on the demo data
// (27, 62 and 17 with the filters they should map to).
const EXAMPLES = [
  'senior TypeScript engineers in New York who have worked at a startup',
  'product designers in Boston or Miami',
  'data engineers in Denver who know Airflow',
];

export function SearchHome() {
  const [brief, setBrief] = useState('');
  const { state, run, reset } = useRunSearch();
  const form = useRef<BriefFormHandle>(null);
  const running = state.status === 'running';
  // The light pools brighten while the model reads the brief, and settle back after.
  useBusyBackdrop(running);

  return (
    <Page>
      <div className="mx-auto max-w-2xl sm:pt-8">
        <h1 className="mb-6 text-[28px] sm:text-[36px]">Who are you looking for?</h1>

        <BriefForm
          ref={form}
          value={brief}
          onChange={(v) => {
            setBrief(v);
            if (state.status === 'error') reset();
          }}
          onSubmit={(b) => void run(b)}
          run={state}
        />

        <div className="mt-6">
          <p className="mb-2 text-[13px] text-muted-foreground">Try an example</p>
          <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => {
                    setBrief(example);
                    void run(example);
                  }}
                  className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-left text-[13px] leading-snug text-foreground transition-colors outline-none hover:border-input hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/25 disabled:opacity-60 max-sm:min-h-11 sm:w-auto sm:rounded-full sm:py-1.5"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <RecentSearches />

        <SavedSearches
          disabled={running}
          onOpen={(savedBrief, filters) => {
            setBrief(savedBrief);
            void run(savedBrief, filters);
          }}
        />
      </div>
    </Page>
  );
}
