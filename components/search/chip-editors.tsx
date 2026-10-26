'use client';
// The editors shown inside a chip's popover:
//   ListEditor   searchable list of vocabulary values (type to filter, arrows, Enter)
//   YearsEditor  min / max years
//   SwitchEditor one on/off setting
// Values only ever come from lib/search/vocab.json, so an edit can never send
// the API a value the data does not have.
import { useId, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// --- ListEditor ---------------------------------------------------------------

type ListEditorProps = {
  label: string;
  options: string[];
  /** Values shown with a check (already chosen). */
  selected: string[];
  /** Values hidden from the list (already used by another chip). */
  hidden?: string[];
  display?: (value: string) => string;
  onPick: (value: string) => void;
  /** Multi-select: picking toggles and the list stays open, with a Done button. */
  onDone?: () => void;
};

function rank(option: string, query: string): number {
  const o = option.toLowerCase();
  if (!query) return 0;
  if (o.startsWith(query)) return 0;
  if (o.split(/[\s/.-]+/).some((word) => word.startsWith(query))) return 1;
  return o.includes(query) ? 2 : -1;
}

export function ListEditor({ label, options, selected, hidden = [], display = (v) => v, onPick, onDone }: ListEditorProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !hidden.includes(o))
      .map((o) => ({ o, r: rank(display(o), q) }))
      .filter((m) => m.r >= 0)
      .sort((a, b) => a.r - b.r) // stable: keeps vocabulary order within a rank
      .map((m) => m.o);
  }, [options, hidden, query, display]);

  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));

  function move(to: number) {
    const next = Math.max(0, Math.min(matches.length - 1, to));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') move(activeIndex + 1);
    else if (e.key === 'ArrowUp') move(activeIndex - 1);
    else if (e.key === 'Home' && !query) move(0);
    else if (e.key === 'End' && !query) move(matches.length - 1);
    else if (e.key === 'Enter') {
      if (matches[activeIndex]) onPick(matches[activeIndex]);
      else if (onDone) onDone();
    } else return;
    e.preventDefault();
  }

  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div className="flex flex-col">
      <div className="relative border-b">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-label={label}
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={matches.length ? optionId(activeIndex) : undefined}
          placeholder={`Search ${label.toLowerCase()}`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-12 w-full bg-transparent pr-3 pl-9 text-[15px] outline-none placeholder:text-muted-foreground sm:h-10 sm:text-sm"
        />
      </div>
      <ul id={`${id}-list`} ref={listRef} role="listbox" aria-label={label} aria-multiselectable={onDone ? true : undefined} className="max-h-64 overflow-y-auto p-1 max-sm:max-h-[50dvh]">
        {matches.map((option, i) => {
          const isSelected = selected.includes(option);
          return (
            <li
              key={option}
              id={optionId(i)}
              role="option"
              aria-selected={isSelected}
              onMouseMove={() => i !== activeIndex && setActive(i)}
              // mousedown, not click: keeps focus in the input
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(option)}
              className={cn(
                'flex min-h-11 cursor-default items-center justify-between gap-2 rounded-md px-2.5 text-[15px] sm:min-h-9 sm:text-sm',
                i === activeIndex && 'bg-accent',
              )}
            >
              <span className="truncate">{display(option)}</span>
              {isSelected && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
            </li>
          );
        })}
        {matches.length === 0 && (
          <li className="px-2.5 py-3 text-[13px] text-muted-foreground" role="presentation">
            No match. Only values that appear in the candidate data can be used.
          </li>
        )}
      </ul>
      {onDone && (
        <div className="flex justify-end border-t p-2">
          <Button size="sm" onClick={onDone} className="max-sm:h-11 max-sm:px-4">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

// --- YearsEditor ---------------------------------------------------------------

type YearsEditorProps = {
  min: number | null;
  max: number | null;
  onSave: (min: number | null, max: number | null) => void;
};

const toNumber = (s: string) => (s.trim() === '' ? null : Number(s));

export function YearsEditor({ min, max, onSave }: YearsEditorProps) {
  const id = useId();
  const [lo, setLo] = useState(min?.toString() ?? '');
  const [hi, setHi] = useState(max?.toString() ?? '');
  const empty = lo.trim() === '' && hi.trim() === '';

  const field = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 sm:h-9 sm:text-sm';
  return (
    <form
      className="space-y-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!empty) onSave(toNumber(lo), toNumber(hi));
      }}
    >
      <p className="text-[13px] text-muted-foreground">Years of experience. Leave one side empty for no limit.</p>
      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1 text-[13px] font-medium" htmlFor={`${id}-min`}>
          At least
          <input id={`${id}-min`} autoFocus type="number" inputMode="numeric" min={0} max={60} value={lo} onChange={(e) => setLo(e.target.value)} className={field} />
        </label>
        <span className="pb-2.5 text-muted-foreground sm:pb-2" aria-hidden>
          to
        </span>
        <label className="flex-1 space-y-1 text-[13px] font-medium" htmlFor={`${id}-max`}>
          At most
          <input id={`${id}-max`} type="number" inputMode="numeric" min={0} max={60} value={hi} onChange={(e) => setHi(e.target.value)} className={field} />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={empty} className="max-sm:h-11 max-sm:w-full">
          Done
        </Button>
      </div>
    </form>
  );
}

// --- SwitchEditor --------------------------------------------------------------

type SwitchEditorProps = { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void };

export function SwitchEditor({ label, description, checked, onChange }: SwitchEditorProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        autoFocus
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
        // 44px tap area around a 24px track
        className="relative flex h-11 w-14 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        <span className={cn('flex h-6 w-10 items-center rounded-full p-0.5 transition-colors', checked ? 'bg-primary' : 'bg-input')}>
          <span className={cn('size-5 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
        </span>
      </button>
    </div>
  );
}
