import { useSettingsContext } from "~/providers/settings-provider";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Link } from "react-router";
import { GraduationCap } from "lucide-react";

export const DashboardHeader = () => {
  const settings = useSettingsContext();

  const companyName = (settings.getSetting("company_name") ||
    "DigiLearn") as string;

  return (
    <div className="space-y-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            asChild
            className="data-[slot=sidebar-menu-button]:!p-1.5"
          >
            <Link to="/" className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-primary to-[oklch(0.43_0.2_280)] text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-md shadow-sm">
                <GraduationCap className="h-[1.125rem] w-[1.125rem]" />
              </div>
              <div className="grid flex-1 text-left leading-tight min-w-0">
                <span className="truncate text-sm font-semibold tracking-tight">
                  {companyName}
                </span>
                <span className="truncate text-[11px] text-sidebar-foreground/60 uppercase tracking-wider">
                  Sales CRM
                </span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
};
