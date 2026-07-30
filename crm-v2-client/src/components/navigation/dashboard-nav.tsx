import { ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { ApprovalNavBadge } from "~/components/navigation/approval-nav-badge";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/components/ui/sidebar";
import { type NavigationItem } from "~/data";

/**
 * DashboardNav — sidebar navigation list.
 *
 * Upgraded in the Pipedrive-inspired pass:
 *   - Splits items into "Workspace" (top-level) and "Sections" (groups with
 *     children) so the sidebar reads as a grouped menu rather than a
 *     flat list.
 *   - Uses NavLink-aware isActive for nested routes (so /leads/123 keeps
 *     "Leads" highlighted).
 *   - Stronger active state styling for readability.
 */
const DashboardNav = ({ items }: { items: NavigationItem[] }) => {
  const { pathname } = useLocation();

  const topLevel = items.filter((i) => !i.children?.length);
  const grouped = items.filter((i) => !!i.children?.length);

  const pathMatches = (url?: string) => {
    if (!url) return false;
    if (url === "/") return pathname === "/";
    return pathname === url || pathname.startsWith(url + "/");
  };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarMenu>
          {topLevel.map((item) => (
            <NavItem
              key={item.title}
              item={{ ...item, isActive: pathMatches(item.url) }}
            />
          ))}
        </SidebarMenu>
      </SidebarGroup>

      {grouped.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarMenu>
            {group.children!.map((child) => (
              <NavItem
                key={child.title}
                item={{ ...child, isActive: pathMatches(child.url) }}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
};

const NavItem = ({
  item,
}: {
  item: NavigationItem & { isActive: boolean };
}) => {
  const hasChildren = !!item.children?.length;

  if (hasChildren) {
    return (
      <Collapsible
        key={item.title}
        asChild
        defaultOpen={item.isActive}
        className="group/collapsible"
      >
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={item.title}>
              {item.icon && <item.icon />}
              <span>{item.title}</span>
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children?.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton asChild>
                    <NavLink to={subItem.url ?? "#"}>
                      <span>{subItem.title}</span>
                      {subItem.url === "/admin/approval-queue" && (
                        <ApprovalNavBadge />
                      )}
                    </NavLink>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip={item.title}
        asChild
        isActive={item.isActive}
        className="data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-medium"
      >
        <NavLink to={item.url ?? "#"}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

export { DashboardNav };
