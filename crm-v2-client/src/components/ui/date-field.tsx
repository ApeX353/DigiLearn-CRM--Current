import { format, parseISO, isValid } from "date-fns";

interface DateFieldProps {
  label?: string;
  value: string; // yyyy-mm-dd (the native date input value)
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  "data-testid"?: string;
}

/**
 * A date input that removes the mm/dd/yyyy vs dd/mm/yyyy ambiguity
 * (TEST-BACKLOG #16). The native picker still stores yyyy-mm-dd, but we show
 * the chosen date spelled out AND as dd/mm/yyyy underneath — so a Zimbabwean
 * manager always sees exactly what they picked, never a silently swapped day
 * and month.
 */
export function DateField({
  label,
  value,
  onChange,
  required,
  min,
  ...rest
}: DateFieldProps) {
  const parsed = value ? parseISO(value) : null;
  const readable =
    parsed && isValid(parsed)
      ? `${format(parsed, "d MMMM yyyy")}  (${format(parsed, "dd/MM/yyyy")})`
      : "dd/mm/yyyy";

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-rose-500"> *</span>}
        </label>
      )}
      <input
        type="date"
        value={value}
        min={min}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-testid={rest["data-testid"]}
      />
      <span
        className={`block text-xs ${parsed && isValid(parsed) ? "text-muted-foreground" : "text-muted-foreground/60"}`}
      >
        {readable}
      </span>
    </div>
  );
}
