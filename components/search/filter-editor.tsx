'use client';
// Picks the editor for a filter kind and turns its result into new filters.
// `chip` is the chip being edited, or null when adding a new filter.
// `onCommit(filters, focusId)`: focusId names the chip that should get focus
// when the popover closes (the edited chip may have a new id).
import { useState } from 'react';
import { ListEditor, SwitchEditor, YearsEditor } from '@/components/search/chip-editors';
import {
  KINDS,
  optionsFor,
  setCurrentJobOnly,
  setListValue,
  setOpenToWork,
  setYears,
  type Chip,
  type ChipKind,
} from '@/lib/search/chips';
import type { Filters } from '@/lib/search/schema';

export const ADD_BUTTON_ID = '__add';

type Props = {
  kind: ChipKind;
  chip: Chip | null;
  filters: Filters;
  onCommit: (filters: Filters, focusId: string) => void;
  onClose: () => void;
};

// List rows show the plain value ("Startup"), chips the phrase ("a startup").
const listLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function FilterEditor({ kind, chip, filters, onCommit, onClose }: Props) {
  const info = KINDS[kind];

  if (info.editor === 'list' && info.field) {
    const field = info.field;
    const current = chip?.raw ?? null;
    return (
      <ListEditor
        label={info.label === 'Worked at' ? (kind === 'companies' ? 'Company' : 'Company type') : info.label}
        options={optionsFor(kind)}
        selected={current ? [current] : []}
        hidden={filters[field].filter((v) => v !== current)}
        display={listLabel}
        onPick={(value) => {
          onCommit(setListValue(filters, field, value, current), `${kind}:${value}`);
          onClose();
        }}
      />
    );
  }

  if (info.editor === 'multi') return <AnyOfEditor filters={filters} onCommit={onCommit} onClose={onClose} />;

  if (info.editor === 'years') {
    return (
      <YearsEditor
        min={filters.min_years}
        max={filters.max_years}
        onSave={(min, max) => {
          onCommit(setYears(filters, min, max), 'years');
          onClose();
        }}
      />
    );
  }

  // Switches. Off removes the filter (no constraint), so the chip goes away.
  const isOpenToWork = kind === 'open_to_work';
  const checked = isOpenToWork ? filters.open_to_work === true : filters.current_job_only;
  return (
    <SwitchEditor
      label={isOpenToWork ? 'Only people open to work' : 'Current job only'}
      description={isOpenToWork ? 'Hide people who are not looking.' : 'Company filters match their current job, not past ones.'}
      checked={checked}
      onChange={(on) => {
        const next = isOpenToWork ? setOpenToWork(filters, on ? true : null) : setCurrentJobOnly(filters, on);
        onCommit(next, on ? kind : ADD_BUTTON_ID);
        onClose();
      }}
    />
  );
}

/** skills_any: toggle several skills, applied together on Done. */
function AnyOfEditor({ filters, onCommit, onClose }: Omit<Props, 'kind' | 'chip'>) {
  const [picked, setPicked] = useState(filters.skills_any);
  return (
    <ListEditor
      label="Skills (any of)"
      options={optionsFor('skills_any')}
      selected={picked}
      onPick={(v) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))}
      onDone={() => {
        onCommit({ ...filters, skills_any: picked }, picked.length ? 'skills_any' : ADD_BUTTON_ID);
        onClose();
      }}
    />
  );
}
