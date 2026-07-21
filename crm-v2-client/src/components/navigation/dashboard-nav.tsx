import { ChevronRight } from "lucide-react";
import { NavLink, useLocation } from "react-router";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "~/components/ui/sidebar";
import { type NavigationItem } from "~/data";

const DashboardNav = ({ items }: { items: NavigationItem[] }) => {
  const { pathname } = useLocation();
  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.length
          ? items.map((item) => {
              const isActive = pathname === item.url;
              return <NavItem key={item.title} item={{ ...item, isActive }} />;
            })
          : null}
      </SidebarMenu>
    </SidebarGroup>
  );
};

const NavItem = ({
  item,
}: {
  item: NavigationItem & { isActive: boolean };
}) => {
  return item.children?.length ? (
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
                  </NavLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  ) : (
    <SidebarMenuButton tooltip={item.title} asChild>
      <NavLink to={item.url ?? "#"}>
        {item.icon && <item.icon />}
        <span>{item.title}</span>
      </NavLink>
    </SidebarMenuButton>
  );
};

export { DashboardNav };
