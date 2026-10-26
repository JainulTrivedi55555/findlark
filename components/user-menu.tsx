'use client';
// Who is signed in, and Sign out.
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { signOut, useAuth } from '@/components/auth-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Display only. No API route returns the company name yet, and the browser may
// not read tables directly, so it is derived from the email domain
// (recruiter@acme.test -> "Acme"). Authorization never uses this: the server
// takes the company from the verified token.
function companyFromEmail(email: string): string {
  const domain = email.split('@')[1]?.split('.')[0] ?? '';
  return domain ? domain[0].toUpperCase() + domain.slice(1) : '';
}

export function UserMenu() {
  const { session } = useAuth();
  const router = useRouter();
  const email = session?.user.email ?? '';
  const company = companyFromEmail(email);

  async function handleSignOut() {
    try {
      await signOut();
      router.replace('/login');
    } catch {
      toast.error('Could not sign out. Try again.');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="relative flex size-11 items-center justify-center rounded-full outline-none sm:size-9 focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        <span className="flex size-8 items-center justify-center rounded-full border bg-card text-[13px] font-medium text-foreground">
          {(company[0] ?? email[0] ?? '?').toUpperCase()}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-60 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block truncate text-sm font-medium text-foreground">{email}</span>
            {company && <span className="block text-xs font-normal text-muted-foreground">{company}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="min-h-10 px-2 sm:min-h-8">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
