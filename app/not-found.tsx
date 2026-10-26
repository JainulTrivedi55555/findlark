'use client';
import Link from 'next/link';
import { StateMessage } from '@/components/search/states';
import { buttonVariants } from '@/components/ui/button';

// Any URL we don't have. Same designed state as the in-app "can't find" screens.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <StateMessage
        art="empty"
        title="We can’t find that page"
        actions={
          <Link href="/" className={buttonVariants()}>
            Go to Search
          </Link>
        }
      >
        The link may be old or incomplete.
      </StateMessage>
    </main>
  );
}
