import { useEffect, useRef, useState } from "react";
import { format, parse, parseISO, isValid } from "date-fns";
import { CalendarDays } from "lucide-react";

interface DateFieldProps {
  label?: string;
  value: string; // ISO yyyy-mm-dd on the wire (unchanged contract)
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  "data-testid"?: string;
}

/**
 * DD/MM/YYYY date field (Zimbabwe format), TEST-BACKLOG #16 + 4-Aug fix.
 *
 * A native `<input type="date">` renders in the browser's OS locale — a US
 * machine shows MM/DD/YYYY and HTML can't override it. So we drive our own
 * `dd/mm/yyyy` TEXT input (always DD/MM/YYYY, everywhere) and keep the ISO
 * `yyyy-mm-dd` value on the wire so the API contract is unchanged. A small
 * calendar button still opens the native picker for point-and-click; whatever
 * it returns is re-displayed as dd/mm/yyyy.
 */
export function DateField({
  label,
  value,
  onChange,
  required,
  min,
  ...rest
}: DateFieldProps) {
  const isoToText = (iso: string) => {
    const d = iso ? parseISO(iso) : null;
    return d && isValid(d) ? format(d, "dd/MM/yyyy") : "";
  };

  const [text, setText] = useState(() => isoToText(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  // Re-sync the visible text whenever a valid value arrives from outside
  // (e.g. form reset, edit-dialog seed, or the native picker below).
  useEffect(() => {
    if (value) setText(isoToText(value));
    else setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleText = (raw: string) => {
    // Keep only digits + slashes, cap at dd/mm/yyyy length.
    const cleaned = raw.replace(/[^\d/]/g, "").slice(0, 10);
    setText(cleaned);
    if (cleaned === "") {
      onChange("");
      return;
    }
    if (cleaned.length === 10) {
      const parsed = parse(cleaned, "dd/MM/yyyy", new Date());
      if (isValid(parsed)) onChange(format(parsed, "yyyy-MM-dd"));
    }
  };

  const parsed = value ? parseISO(value) : null;
  const readable =
    parsed && isValid(parsed) ? format(parsed, "d MMMM yyyy") : "";

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          value={text}
          required={required}
          onChange={(e) => handleText(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid={rest["data-testid"]}
        />
        <button
          type="button"
          onClick={() => pickerRef.current?.showPicker?.()}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Open date picker"
          tabIndex={-1}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        {/* Hidden native picker — only used for point-and-click; its value
            flows back through onChange and is re-rendered as dd/mm/yyyy. */}
        <input
          ref={pickerRef}
          type="date"
          value={value}
          min={min}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      {readable && (
        <span className="block text-xs text-muted-foreground">{readable}</span>
      )}
    </div>
  );
}
