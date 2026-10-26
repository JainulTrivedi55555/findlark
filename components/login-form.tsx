'use client';
// Sign in with Supabase email + password. On success the AuthProvider sees the
// new session and RedirectIfSignedIn sends the recruiter to /.
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RedirectIfSignedIn } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from '@/components/logo';
import { transition } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { supabaseBrowser } from '@/lib/supabase-browser';

// DEMO ONLY: the two seeded recruiters (scripts/seed.ts), shown as click-to-fill
// chips so anyone trying the demo can sign in without looking up the credentials.
// These are public test accounts on a local database; a real product would never list them.
const DEMO_PASSWORD = 'findlark-demo';
const DEMO_ACCOUNTS = ['recruiter@acme.test', 'recruiter@globex.test'];

const card = 'w-full max-w-sm rounded-xl border bg-card p-6 sm:p-8';

function LoginSkeleton() {
  return (
    <div className={card} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-20" />
      <Skeleton className="mt-3 h-4 w-48" />
      <Skeleton className="mt-8 h-11 w-full" />
      <Skeleton className="mt-4 h-11 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
    </div>
  );
}

const SIGN_IN_TIMEOUT_MS = 15_000;
const UNREACHABLE = 'Can’t reach the server. Check your connection and try again.';

// supabase-js reports a network failure as a returned error (AuthRetryableFetchError,
// status 0), not a throw, so both paths end up here.
function friendlyError(error: { message: string; name?: string; status?: number }): string {
  if (/invalid login credentials/i.test(error.message)) return 'That email and password don’t match.';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network/i.test(error.message)) {
    return UNREACHABLE;
  }
  return error.message;
}

/** Rejects after ms, so a request that never answers cannot leave the spinner running. */
function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

export function LoginForm() {
  const reduce = useReducedMotion();
  const enter = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { ...transition, delay: i * 0.06 },
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { error } = await Promise.race([
        supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password }),
        timeout(SIGN_IN_TIMEOUT_MS),
      ]);
      if (error) setError(friendlyError(error));
      // On success, keep the loading state: the redirect to / follows.
      else return;
    } catch {
      // Timeout, or a thrown network error.
      setError(UNREACHABLE);
    }
    setPending(false);
  }

  function fillDemo(account: string) {
    setEmail(account);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <RedirectIfSignedIn fallback={<LoginSkeleton />}>
      <div className="w-full max-w-sm">
        {/* A calm entrance: wordmark, promise, form, 60 ms apart (opacity and an 8px rise). */}
        <motion.div {...enter(0)} className="flex flex-col items-center text-center">
          <Logo size={32} />
          <h1 className="mt-6 text-[28px] leading-tight text-balance sm:text-[32px]">Describe who you’re hiring in plain English.</h1>
        </motion.div>

        <motion.div {...enter(1)} className={cn(card, 'mt-7')}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {error && (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="mt-2 w-full sm:h-10" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </motion.div>

        <motion.div {...enter(2)} className="mt-5 px-1 text-center text-[13px] text-muted-foreground">
          <p>Fill in a demo account</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account}
                type="button"
                onClick={() => fillDemo(account)}
                className="inline-flex h-9 items-center rounded-full border bg-card px-3 text-[13px] text-foreground transition-colors outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 max-sm:h-11"
              >
                {account}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </RedirectIfSignedIn>
  );
}
