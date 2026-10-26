import { AppShell } from '@/components/app-shell';

// Every signed-in page: the shell plus a session guard (components/auth-guard.tsx).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
