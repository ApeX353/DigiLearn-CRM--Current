import { Outlet, useLocation } from "react-router";
import MainDashboardSidebar from "../navigation/main-dashboard-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { Separator } from "../ui/separator";
import { UserButton } from "../user-button";
import { NotificationBell } from "~/components/notifications-bell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { NavigationConfig } from "~/data";

export default function DashboardLayout() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const currentTitle =
    NavigationConfig.find((item) => item.url === location.pathname)?.title ||
    pathSegments[pathSegments.length - 1] ||
    "Dashboard";

  return (
    <main className="min-h-screen">
      <SidebarProvider>
        <MainDashboardSidebar />
        <SidebarInset className="relative">
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-card/80">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb className="flex-1">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                {location.pathname !== "/" && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentTitle}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <UserButton showLogin />
            </div>
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </main>
  );
}
