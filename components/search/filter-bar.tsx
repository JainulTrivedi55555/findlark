'use client';
// "Understood as": the staged filters as chips, the unsupported parts of the
// brief, and "+ Add filter". Every change goes to onChange; nothing runs until
// the recruiter presses Apply (see apply-bar.tsx).
//
// Focus: after a chip is removed, focus moves to the next chip (or the add
// button), and after an edit it lands on the edited chip, which may have a new
// id ("skills:Go" -> "skills:Rust"). Keyboard users never lose their place.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AddFilter } from '@/components/search/add-filter';
import { FilterChip, UnsupportedChip } from '@/components/search/filter-chip';
import { ADD_BUTTON_ID } from '@/components/search/filter-editor';
import { dismissUnsupported, filtersToChips, removeChip } from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';

function findTrigger(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-chip-trigger="${CSS.escape(id)}"]`);
}

type Props = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  /** First load of the results page: chips enter one by one. */
  reveal?: boolean;
  /** The chip being hovered or focused (null when none), so the brief can emphasise its words. */
  onActiveChip?: (id: string | null) => void;
};

export function FilterBar({ filters, onChange, reveal = false, onActiveChip }: Props) {
  const chips = filtersToChips(filters);

  // After a popover closes: Base UI asks finalFocus where focus should go.
  const editFocus = useRef<string | null>(null);
  const finalFocus = () => {
    const id = editFocus.current;
    editFocus.current = null;
    return (id && (findTrigger(id) ?? findTrigger(ADD_BUTTON_ID))) || true;
  };
  function commit(next: Filters, focusId: string) {
    editFocus.current = focusId;
    onChange(next);
  }

  // After an x click there is no popover, so focus moves in an effect.
  const [removeFocus, setRemoveFocus] = useState<{ id: string } | null>(null);
  useEffect(() => {
    if (removeFocus) (findTrigger(removeFocus.id) ?? findTrigger(ADD_BUTTON_ID))?.focus();
  }, [removeFocus]);

  function remove(index: number) {
    const neighbour = chips[index + 1] ?? chips[index - 1];
    setRemoveFocus({ id: neighbour?.id ?? ADD_BUTTON_ID });
    onChange(removeChip(filters, chips[index]));
  }

  return (
    <ul aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <AnimatePresence mode="popLayout" initial={reveal}>
        {chips.map((chip, i) => (
          <FilterChip
            key={chip.id}
            chip={chip}
            filters={filters}
            onCommit={commit}
            onRemove={() => remove(i)}
            finalFocus={finalFocus}
            reveal={reveal ? i : null}
            onActive={(on) => onActiveChip?.(on ? chip.id : null)}
          />
        ))}
        {filters.unsupported.map((u, i) => (
          <UnsupportedChip
            key={`unsupported:${u.text}`}
            text={u.text}
            reveal={reveal ? chips.length + i : null}
            onDismiss={() => {
              setRemoveFocus({ id: ADD_BUTTON_ID });
              onChange(dismissUnsupported(filters, i));
            }}
          />
        ))}
        <AddFilter key="add" reveal={reveal ? chips.length + filters.unsupported.length : null} filters={filters} onCommit={commit} finalFocus={finalFocus} />
      </AnimatePresence>
    </ul>
  );
}
