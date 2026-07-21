import { Plus, Target, Receipt, FileText, CheckSquare, GraduationCap } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { useRbacStore } from "~/stores/use-rbac-store";
import type { Role } from "~/api/rbac";

/**
 * QuickAdd — global creation shortcut in the app topbar.
 *
 * Mirrors the Pipedrive-style "+" menu that is always within reach so reps
 * can create a lead/deal/task/quote without navigating away from the page
 * they are on. Items are role-gated through the existing RBAC store.
 */

interface QuickAddItem {
  label: string;
  description?: string;
  icon: typeof Plus;
  to: string;
  allowedRoles: Role["name"][];
}

const ITEMS: QuickAddItem[] = [
  {
    label: "New Lead",
    description: "Capture a new prospect",
    icon: Target,
    to: "/leads/new",
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    label: "New School",
    description: "Add an institution record",
    icon: GraduationCap,
    to: "/schools?create=1",
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    label: "New Task",
    description: "Schedule a follow-up",
    icon: CheckSquare,
    to: "/tasks?create=1",
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    label: "New Quote",
    description: "Draft a quotation",
    icon: FileText,
    to: "/quotes?create=1",
    allowedRoles: ["admin", "manager", "sales_manager", "sales_rep"],
  },
  {
    label: "New Invoice",
    description: "Issue an invoice",
    icon: Receipt,
    to: "/invoices?create=1",
    allowedRoles: ["admin", "manager", "sales_manager"],
  },
];

export function QuickAdd() {
  const navigate = useNavigate();
  const hasAnyRole = useRbacStore((s) => s.hasAnyRole);
  const isLoaded = useRbacStore((s) => s.isLoaded);

  const visible = ITEMS.filter((i) => hasAnyRole(i.allowedRoles));
  if (!isLoaded || visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="h-9 gap-1.5 shadow-sm font-medium"
          data-testid="quick-add-trigger"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Quick create
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              className="gap-3 py-2.5 cursor-pointer"
              onSelect={() => navigate(item.to)}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/50 text-accent-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium leading-none">
                  {item.label}
                </span>
                {item.description && (
                  <span className="text-xs text-muted-foreground mt-0.5 truncate">
                    {item.description}
                  </span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
