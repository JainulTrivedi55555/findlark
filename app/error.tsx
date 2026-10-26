'use client';
// Any error thrown while rendering a page (below the root layout) lands here.
// Same card as every other error. Only the digest is logged: in production it
// is the id that matches the server log, and the message is never shown.
import { useEffect } from 'react';
import { ErrorCard } from '@/components/error-card';
import { PAGE_ERROR_COPY } from '@/lib/error-copy';

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    const digest = error instanceof Error && 'digest' in error ? String(error.digest) : 'none';
    console.error(`page error (digest ${digest})`);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <ErrorCard copy={PAGE_ERROR_COPY} onRetry={retry} />
    </main>
  );
}
