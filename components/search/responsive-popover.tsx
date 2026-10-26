'use client';
// A popover on desktop, a bottom sheet on phones.
// `trigger` is the element that opens it; both Base UI parts return focus to
// it on close, unless `finalFocus` names another element (used when the
// trigger chip was replaced by an edit and no longer exists).
import type { ReactElement, ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsDesktop } from '@/lib/use-media-query';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  /** Heading of the bottom sheet; the popover's accessible name. */
  title: string;
  finalFocus?: () => HTMLElement | boolean;
  /** Which edge of the trigger the popover lines up with (desktop). */
  align?: 'start' | 'end';
  children: ReactNode;
};

export function ResponsivePopover({ open, onOpenChange, trigger, title, finalFocus, align = 'start', children }: Props) {
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger render={trigger} />
        <PopoverContent align={align} sideOffset={6} aria-label={title} finalFocus={finalFocus} className="w-80 p-0">
          {children}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent side="bottom" finalFocus={finalFocus} className="gap-0">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-base">{title}</SheetTitle>
        </SheetHeader>
        <div className="pb-2">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
