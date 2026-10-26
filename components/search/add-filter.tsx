'use client';
// "+ Add filter": one popover in two steps. First the kinds of filter that can
// still be added, then the same editor a chip uses.
import { forwardRef, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, Plus } from 'lucide-react';
import { chipMotion, revealMotion } from '@/components/search/filter-chip';
import { ADD_BUTTON_ID, FilterEditor } from '@/components/search/filter-editor';
import { ResponsivePopover } from '@/components/search/responsive-popover';
import { ADD_MENU_LABEL, addableKinds, type ChipKind } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';

type Props = {
  filters: Filters;
  onCommit: (filters: Filters, focusId: string) => void;
  finalFocus: () => HTMLElement | boolean;
  reveal?: number | null;
};

export const AddFilter = forwardRef<HTMLLIElement, Props>(function AddFilter({ filters, onCommit, finalFocus, reveal = null }, ref) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChipKind | null>(null);
  const kinds = addableKinds(filters);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setKind(null); // always start at the list of kinds
  }

  return (
    <motion.li ref={ref} {...chipMotion} {...revealMotion(reveal)} className="inline-flex">
      <ResponsivePopover
        open={open}
        onOpenChange={onOpenChange}
        title={kind ? `Add ${ADD_MENU_LABEL[kind].toLowerCase()}` : 'Add filter'}
        finalFocus={finalFocus}
        trigger={
          <button
            type="button"
            data-chip-trigger={ADD_BUTTON_ID}
            className="relative inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-primary/35 px-3 text-[13px] font-medium text-primary outline-none hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/25 after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] sm:h-8 sm:after:hidden"
          >
            <Plus className="size-3.5" aria-hidden />
            Add filter
          </button>
        }
      >
        {kind ? (
          <FilterEditor kind={kind} chip={null} filters={filters} onCommit={onCommit} onClose={() => setOpen(false)} />
        ) : (
          <KindList kinds={kinds} onPick={setKind} />
        )}
      </ResponsivePopover>
    </motion.li>
  );
});

function KindList({ kinds, onPick }: { kinds: ChipKind[]; onPick: (kind: ChipKind) => void }) {
  // Up / Down move between rows, like a menu.
  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }

  return (
    <ul className="max-h-80 overflow-y-auto p-1 max-sm:max-h-[60dvh]" onKeyDown={onKeyDown} aria-label="Filter kinds">
      {kinds.map((k, i) => (
        <li key={k}>
          <button
            type="button"
            autoFocus={i === 0}
            onClick={() => onPick(k)}
            className="flex min-h-11 w-full items-center justify-between rounded-md px-2.5 text-left text-[15px] outline-none hover:bg-accent focus-visible:bg-accent sm:min-h-9 sm:text-sm"
          >
            {ADD_MENU_LABEL[k]}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
