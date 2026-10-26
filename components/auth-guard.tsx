'use client';
// Route guards. Signed-out visitors on app pages go to /login; signed-in
// recruiters on /login go to /. While the session is still loading, a quiet
// skeleton shows instead of the page, so protected content never flashes.
// This is a UX guard only: the API checks the token on every request.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Skeleton } from '@/components/ui/skeleton';

export function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-1 flex-col">
      <div className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
        <Skeleton className="h-5 w-16" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 pt-12 sm:px-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'signed-out') router.replace('/login');
  }, [status, router]);
  if (status !== 'signed-in') return <ShellSkeleton />;
  return <>{children}</>;
}

export function RedirectIfSignedIn({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'signed-in') router.replace('/');
  }, [status, router]);
  if (status !== 'signed-out') return <>{fallback}</>;
  return <>{children}</>;
}
