'use client';
// A list name with a pencil icon. Click the pencil to edit in place: Enter
// saves, Esc cancels. `onSave` gets the trimmed name; if it throws, the message
// shows under the field and the field stays open. Names are 1 to 80 characters
// (lib/shortlists-logic.ts, and the API checks again).
import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateName } from '@/lib/shortlists-logic';

type Props = {
  name: string;
  onSave: (name: string) => Promise<void>;
  /** The name as it shows when not editing (a link on the lists page, a heading on the detail page). */
  children: React.ReactNode;
};

export function EditableName({ name, onSave, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pencil = useRef<HTMLButtonElement>(null);

  function close() {
    setEditing(false);
    setError(null);
    // The pencil is mounted again on the next render; put focus back on it.
    requestAnimationFrame(() => pencil.current?.focus());
  }

  async function save() {
    if (saving) return;
    const checked = validateName(value);
    if (!checked.ok) return setError(checked.message);
    if (checked.name === name) return close();
    setSaving(true);
    try {
      await onSave(checked.name);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="min-w-0 flex-1">
        <label htmlFor="rename-list" className="sr-only">
          List name
        </label>
        <Input
          id="rename-list"
          autoFocus
          value={value}
          disabled={saving}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            }
          }}
          onBlur={() => !saving && !error && close()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'rename-list-error' : undefined}
        />
        {error && (
          <p id="rename-list-error" role="alert" className="mt-1.5 text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      <Button
        ref={pencil}
        variant="ghost"
        size="icon"
        aria-label={`Rename ${name}`}
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="text-muted-foreground"
      >
        <Pencil aria-hidden />
      </Button>
    </>
  );
}
