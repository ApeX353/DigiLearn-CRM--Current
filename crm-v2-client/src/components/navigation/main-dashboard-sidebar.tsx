import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
} from "~/components/ui/sidebar";
import { NavigationConfig, type NavigationItem } from "~/data";
import { useRbacStore } from "~/stores/use-rbac-store";
import { DashboardNav } from "./dashboard-nav";
import { DashboardHeader } from "./dashboard-header";
import { useMemo } from "react";
import { Settings, LogOut, CircleUser } from "lucide-react";
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

  // Recursively filter nav items according to the user's roles. A parent item
  // is kept if it has any visible children OR the user has a role that allows
  // viewing the parent directly.
  const filterNav = (navItems: NavigationItem[]): NavigationItem[] => {
    const nav: NavigationItem[] = [];

    navItems.forEach((item) => {
      if (item.children?.length) {
        const filteredChildren = filterNav(item.children);
        const hasRole = hasAnyRole(item?.allowedRoles || []);
        if (hasRole || filteredChildren.length > 0) {
          nav.push({
            ...item,
            canView: hasRole,
            children: filteredChildren,
          });
        }
      } else {
        if (hasAnyRole(item?.allowedRoles || [])) {
          nav.push({ ...item, canView: true });
        }
      }
    });

    return nav;
  };

  const filteredNavItems = useMemo(
    () => filterNav(NavigationConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasAnyRole, isLoaded],
  );

  if (!isLoaded) {
    return null;
  }

  // Compute user display name for the footer.
  const userLabel =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    "Account";

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="pb-2">
        <DashboardHeader />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <DashboardNav items={filteredNavItems} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border gap-1 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/profile")}
              tooltip="Profile"
            >
              <NavLink to="/profile" className="flex items-center gap-3">
                <CircleUser className="h-4 w-4" />
                <span className="truncate">{userLabel}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/admin/settings")}
              tooltip="Settings"
            >
              <NavLink to="/admin/settings" className="flex items-center gap-3">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarSeparator className="my-1" />
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => logout()}
              tooltip="Sign out"
              data-testid="nav-signout"
              className="flex items-center gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default MainDashboardSidebar;
