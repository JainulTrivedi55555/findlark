'use client';
// Last resort: an error in the root layout itself. It replaces the whole
// document, so it brings its own <html>, <body>, fonts and styles.
import { GeistSans } from 'geist/font/sans';
import { ErrorCard } from '@/components/error-card';
import { PAGE_ERROR_COPY } from '@/lib/error-copy';
import './globals.css';

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>Something went wrong · Findlark</title>
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
          <ErrorCard copy={PAGE_ERROR_COPY} onRetry={retry} />
        </main>
      </body>
    </html>
  );
}
