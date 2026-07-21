import { useSettingsContext } from "~/providers/settings-provider";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../ui/sidebar";
import { Link } from "react-router";

export const DashboardHeader = () => {
  const settings = useSettingsContext();

  const companyName = (settings.getSetting("company_name") ||
    "Digilearn") as string;

  return (
    <div className="space-y-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild>
            <Link to="/">
              {/* <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <BookOpen className="size-4" />
              </div> */}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{companyName}</span>
                <span className="truncate text-xs">CRM</span>
              </div>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </div>
  );
};
