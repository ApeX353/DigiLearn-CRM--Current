import { useId } from "react";
import { Input } from "~/components/ui/input";
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS, type EventCategory } from "~/api/campaigns/event-categories";

export function EventCategoryFields({ category, customName, onChange }: {
  category?: EventCategory | null; customName?: string | null;
  onChange: (category: EventCategory | null, customName: string | null) => void;
}) {
  const id = useId();
  return <div className="space-y-3">
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">Event category</label>
      <select id={id} className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={category || ""} onChange={e => onChange((e.target.value || null) as EventCategory | null, null)}>
        <option value="">Not an event / not classified</option>
        {EVENT_CATEGORIES.map(c => <option key={c} value={c}>{EVENT_CATEGORY_LABELS[c]}</option>)}
      </select>
    </div>
    {category === "CUSTOM" && <div>
      <label htmlFor={id + "-name"} className="mb-1 block text-sm font-medium">Custom event name *</label>
      <Input id={id + "-name"} value={customName || ""} maxLength={200}
        placeholder="e.g. Heads Meeting" onChange={e => onChange(category, e.target.value)} />
    </div>}
  </div>;
}
