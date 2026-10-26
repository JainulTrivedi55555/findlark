'use client';
// Session state for the whole app: loading, signed in or signed out.
// The session comes from the browser Supabase client (stored in localStorage),
// so it is only known after the first render on the client. Until then the
// status is 'loading' and the guards below show a quiet skeleton, so protected
// content never flashes for a signed-out visitor.
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { resetAppStore } from '@/lib/app-store';
import { supabaseBrowser } from '@/lib/supabase-browser';

type AuthState =
  | { status: 'loading'; session: null }
  | { status: 'signed-in'; session: Session }
  | { status: 'signed-out'; session: null };

const AuthContext = createContext<AuthState>({ status: 'loading', session: null });

function toState(session: Session | null): AuthState {
  return session ? { status: 'signed-in', session } : { status: 'signed-out', session: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });

  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(toState(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') resetAppStore();
      setState(toState(session));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function signOut() {
  resetAppStore();
  await supabaseBrowser().auth.signOut();
}
