import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PersonView } from '@/components/person/person-view';

export const metadata: Metadata = { title: 'Candidate' };

// Candidate profile. Loads on the client through /api; Suspense is required
// for useSearchParams (?search=ID&from=/search/ID?page=N).
export default function PersonPage() {
  return (
    <Suspense fallback={null}>
      <PersonView />
    </Suspense>
  );
}
