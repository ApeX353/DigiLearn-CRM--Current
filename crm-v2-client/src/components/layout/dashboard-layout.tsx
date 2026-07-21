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
import { useNotificationSocket } from "~/hooks/use-notification-socket";
import { useIsMobile } from "~/hooks/use-mobile";
import { QuickAdd } from "../navigation/quick-add";
import { GlobalSearch } from "../navigation/global-search";
import { FollowUpPromptDialog } from "../activities/follow-up-prompt-dialog";
import { ActivityCompletionDialog } from "../activities/activity-completion-dialog";

/**
 * DashboardLayout — redesigned app shell for the Pipedrive-inspired UX pass.
 *
 * Changes over the previous layout:
 *   - Adds a centered GlobalSearch input (Cmd/Ctrl+K) for quick navigation.
 *   - Adds a QuickAdd button for creating leads/deals/tasks from anywhere.
 *   - Sticky, slightly translucent topbar with clearer visual weight.
 *   - Breadcrumb supports nested routes (e.g. /admin/users).
 */
export default function DashboardLayout() {
  useNotificationSocket();
  const isMobile = useIsMobile();
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  // Resolve the current page title from the flat nav config, including children.
  const findTitle = (path: string): string | undefined => {
    for (const item of NavigationConfig) {
      if (item.url === path) return item.title;
      if (item.children) {
        const hit = item.children.find((c) => c.url === path);
        if (hit) return hit.title;
      }
    }
    return undefined;
  };

  const currentTitle =
    findTitle(location.pathname) ||
    pathSegments[pathSegments.length - 1]?.replace(/-/g, " ") ||
    "Dashboard";

  return (
    <main className="min-h-screen">
      <SidebarProvider defaultOpen={!isMobile}>
        <MainDashboardSidebar />
        <SidebarInset className="relative">
          <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-2 border-b px-3 md:px-4 bg-card/90 backdrop-blur-md">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-1 md:mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb className="hidden sm:block min-w-0">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href="/"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Home
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {location.pathname !== "/" && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="capitalize font-medium">
                        {currentTitle}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2 md:gap-3">
              <GlobalSearch />
              <QuickAdd />
              <Separator
                orientation="vertical"
                className="hidden md:block data-[orientation=vertical]:h-5"
              />
              <NotificationBell />
              <UserButton showLogin />
            </div>
          </header>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
      {/*
       * Section 1 / activity spec: centralised "what's next?" prompt.
       * Mounted once here so every page that completes a meeting / call
       * / task shares the same queue and UX.
       */}
      {/*
       * Completion-outcome capture (mandatory when marking any
       * activity done) and follow-up prompt (mandatory next-step
       * capture for active records). Mounted in this order so the
       * outcome dialog resolves FIRST, then the follow-up dialog
       * picks up the newly-completed activity via its auto-enqueue.
       */}
      <ActivityCompletionDialog />
      <FollowUpPromptDialog />
    </main>
  );
}
