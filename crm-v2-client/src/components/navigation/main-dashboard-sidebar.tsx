import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "~/components/ui/sidebar";
import { NavigationConfig, type NavigationItem } from "~/data";
import { useRbacStore } from "~/stores/use-rbac-store";
import { DashboardNav } from "./dashboard-nav";
import { DashboardHeader } from "./dashboard-header";
import { useMemo } from "react";
import { Settings, LogOut } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { useAuthStore } from "~/stores/use-auth-store";
import { useLogout } from "~/api/auth/use-auth";

const MainDashboardSidebar = ({
  ...props
}: React.ComponentProps<typeof Sidebar>) => {
  const location = useLocation();
  const hasAnyRole = useRbacStore((state) => state.hasAnyRole);
  const isLoaded = useRbacStore((state) => state.isLoaded);
  const user = useAuthStore((state) => state.user);
  const { mutate: logout } = useLogout();

  const isActive = (path: string) => location.pathname === path;

  // this filters all allowed navigation items
  const filterNav = (navItems: NavigationItem[]): NavigationItem[] => {
    const nav: NavigationItem[] = [];

    navItems.forEach((item) => {
      if (item.children?.length) {
        // Recursively filter children first
        const filteredChildren = filterNav(item.children);

        // Check if user has role for parent OR if there are any visible children
        const hasRole = hasAnyRole(item?.allowedRoles || []);

        // Include parent if user has role OR if there are visible children
        if (hasRole || filteredChildren.length > 0) {
          nav.push({
            ...item,
            canView: hasRole,
            children: filteredChildren,
          });
        }
      } else {
        // Leaf item - check if user has required role
        if (hasAnyRole(item?.allowedRoles || [])) {
          nav.push({ ...item, canView: true });
        }
      }
    });

    return nav;
  };

  // this filters navigation items
  const filteredNavItems = useMemo(
    () => filterNav(NavigationConfig),
    [hasAnyRole, isLoaded]
  );

  if (!isLoaded) {
    return null;
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <DashboardHeader />
      </SidebarHeader>
      <SidebarContent>
        <DashboardNav items={filteredNavItems} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/admin/settings")}>
              <NavLink to="/admin/settings" className="flex items-center gap-3">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => logout()}
              data-testid="nav-signout"
              className="flex items-center gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {user && (
            <div className="px-2 py-2 text-xs text-sidebar-foreground/50 truncate">
              {user.email}
            </div>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default MainDashboardSidebar;
