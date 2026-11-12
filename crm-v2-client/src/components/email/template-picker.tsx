import { useState } from "react";
import { ChevronDown, FileText, Loader2, Search, Share2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { toast } from "sonner";
import {
  useEmailTemplates,
  type EmailTemplate,
  type RenderContext,
  type RenderedEmail,
} from "~/api/email-templates";
import { apiClientAuth, handleApiError } from "~/api/axios";

interface TemplatePickerProps {
  /**
   * Context used when rendering — the server will substitute the
   * merge-vars against the given entities. Any of these may be
   * undefined; variables without a source will render to empty strings.
   */
  context: RenderContext;
  onApply: (rendered: RenderedEmail, template: EmailTemplate) => void;
  /** Show a compact label-less button for tight headers. */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Popover-based template picker. Usage:
 *   <TemplatePicker
 *     context={{ lead_id, deal_id, contact_id }}
 *     onApply={(rendered) => { setSubject(rendered.subject); setBody(rendered.body_html); }}
 *   />
 *
 * We deliberately render server-side instead of shipping a client
 * Mustache — one source of truth for how templates resolve, and the
 * authenticated server sees all related entities without the client
 * having to plumb them.
 */
export function TemplatePicker({
  context,
  onApply,
  compact,
  disabled,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const { data: templates, isLoading } = useEmailTemplates();

  const applyTemplate = async (tpl: EmailTemplate) => {
    setApplyingId(tpl.id);
    try {
      // We use the raw axios client here instead of the react-query hook
      // because invoking a hook from a callback isn't possible — and we
      // want the latest render every time the picker opens, not a
      // cached one from a previous entity context.
      const res = await apiClientAuth.get<{ data: RenderedEmail }>(
        `/email-templates/${tpl.id}/render`,
        {
          params: {
            lead_id: context.lead_id,
            deal_id: context.deal_id,
            contact_id: context.contact_id,
          },
        },
      );
      onApply(res.data.data, tpl);
      setOpen(false);
    } catch (err) {
      toast.error(handleApiError(err));
    } finally {
      setApplyingId(null);
    }
  };

  const items = (templates ?? []).filter((t) => t.is_active);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          disabled={disabled}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          {compact ? "Template" : "Use template"}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-80">
        <Command>
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 opacity-50 mr-2" />
            <CommandInput
              placeholder="Search templates…"
              className="h-9 border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-72">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty>No templates yet.</CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((tpl) => (
                  <CommandItem
                    key={tpl.id}
                    value={`${tpl.name} ${tpl.slug} ${tpl.category ?? ""}`}
                    onSelect={() => applyTemplate(tpl)}
                    className="flex items-start gap-2 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{tpl.name}</span>
                        {tpl.owner_user_id === null && (
                          <Badge
                            variant="secondary"
                            className="h-4 px-1 text-[10px]"
                          >
                            <Share2 className="h-2.5 w-2.5 mr-0.5" />
                            shared
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {tpl.subject}
                      </div>
                    </div>
                    {applyingId === tpl.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
