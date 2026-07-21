import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  FileText,
  CheckSquare,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { getShortcutHint } from "~/hooks/use-activity-hot-keys";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type {
  ComposerActivityType,
  TypeSwitcherProps,
} from "~/types/activity-composers";

const typeConfig: {
  type: ComposerActivityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "call", label: "Call", icon: Phone },
  { type: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { type: "email", label: "Email", icon: Mail },
  { type: "meeting", label: "Meeting", icon: Calendar },
  { type: "note", label: "Note", icon: FileText },
  { type: "task", label: "Task", icon: CheckSquare },
];

export function TypeSwitcher({ activeType, onTypeChange }: TypeSwitcherProps) {
  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {typeConfig.map(({ type, label, icon: Icon }) => {
          const shortcut = getShortcutHint(type);
          const isActive = activeType === type;

          return (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => onTypeChange(type)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Press{" "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">
                  {shortcut}
                </kbd>{" "}
                to switch
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
