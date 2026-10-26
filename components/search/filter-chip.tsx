'use client';
// One filter as a chip: "Label: Value". Click the chip to edit it in a popover
// (a bottom sheet on phones); click its x to remove it. Unsupported parts of
// the brief get a muted, dashed chip that can only be dismissed.
import { forwardRef, useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { FilterEditor } from '@/components/search/filter-editor';
import { ResponsivePopover } from '@/components/search/responsive-popover';
import { chipText, type Chip } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';
import { fastTransition } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Chips scale in and out from their own centre; layout moves the others.
export const chipMotion = {
  layout: true,
  initial: { opacity: 0, scale: 0.92 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
  transition: fastTransition,
} as const;

// First load of a results page: chips enter one by one (40 ms apart, after the
// brief), fading in with a 6px rise. `index` is null at all other times.
export const REVEAL_STAGGER_S = 0.04;
export const REVEAL_START_S = 0.1;
export function revealMotion(index: number | null) {
  if (index === null) return {};
  return {
    initial: { opacity: 0, y: 6, scale: 1 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { ...fastTransition, delay: REVEAL_START_S + Math.min(index, 8) * REVEAL_STAGGER_S },
  };
}

const chipBase = 'inline-flex h-9 items-center rounded-full border text-[13px] sm:h-8';

// A 44px tap target on phones without making the chip itself taller.
const tapArea = 'relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""] sm:after:hidden';

const removeButton =
  'mr-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ' +
  'hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25 sm:size-7 ' +
  tapArea;

type Props = {
  chip: Chip;
  filters: Filters;
  onCommit: (filters: Filters, focusId: string) => void;
  onRemove: () => void;
  finalFocus: () => HTMLElement | boolean;
  /** Position in the first-load reveal, or null. */
  reveal?: number | null;
  /** Hover/focus on the chip, so the brief can emphasise its words. */
  onActive?: (active: boolean) => void;
};

export const FilterChip = forwardRef<HTMLLIElement, Props>(function FilterChip(
  { chip, filters, onCommit, onRemove, finalFocus, reveal = null, onActive },
  ref,
) {
  const [open, setOpen] = useState(false);
  const text = chipText(chip);
  const showValue = text !== chip.label;

  return (
    <motion.li
      ref={ref}
      {...chipMotion}
      {...revealMotion(reveal)}
      onPointerEnter={() => onActive?.(true)}
      onPointerLeave={() => onActive?.(false)}
      onFocus={() => onActive?.(true)}
      onBlur={() => onActive?.(false)}
      className={cn(chipBase, 'bg-card', open && 'border-ring ring-3 ring-ring/15')}
    >
      <ResponsivePopover
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${chip.label.toLowerCase()}`}
        finalFocus={finalFocus}
        trigger={
          <button
            type="button"
            data-chip-trigger={chip.id}
            aria-label={`${text}. Edit`}
            className={cn('flex h-full max-w-[17rem] items-center gap-1 rounded-l-full pr-1.5 pl-3 outline-none hover:text-primary focus-visible:text-primary focus-visible:underline', tapArea)}
          >
            <span className={cn('shrink-0', showValue ? 'text-muted-foreground' : 'font-medium')}>
              {showValue ? `${chip.label}:` : chip.label}
            </span>
            {showValue && <span className="truncate font-medium">{chip.value}</span>}
          </button>
        }
      >
        <FilterEditor kind={chip.kind} chip={chip} filters={filters} onCommit={onCommit} onClose={() => setOpen(false)} />
      </ResponsivePopover>
      <button type="button" onClick={onRemove} aria-label={`Remove ${text}`} className={removeButton}>
        <X className="size-3.5" aria-hidden />
      </button>
    </motion.li>
  );
});

export const UnsupportedChip = forwardRef<HTMLLIElement, { text: string; onDismiss: () => void; reveal?: number | null }>(function UnsupportedChip(
  { text, onDismiss, reveal = null },
  ref,
) {
  return (
    <motion.li
      ref={ref}
      {...chipMotion}
      {...revealMotion(reveal)}
      title="There is no candidate data for this, so it can't be used as a filter."
      className={cn(chipBase, 'border-dashed border-input bg-transparent pl-3 text-muted-foreground')}
    >
      <span className="max-w-[16rem] truncate pr-1">
        Can’t filter by: <span className="text-foreground/80">{text}</span>
      </span>
      <button type="button" onClick={onDismiss} aria-label={`Dismiss “${text}” and search without it`} className={removeButton}>
        <X className="size-3.5" aria-hidden />
      </button>
    </motion.li>
  );
});
