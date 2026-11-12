import { useEffect } from "react";
import { useUserPermissions } from "~/api/rbac";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuthStore } from "~/stores/use-auth-store";
import { useRbacStore } from "~/stores/use-rbac-store";

interface RbacProviderProps {
  children: React.ReactNode;
}

export function RbacProvider({ children }: RbacProviderProps) {
  const { isAuthenticated, user } = useAuthStore();
  const clearPermissions = useRbacStore((state) => state.clearPermissions);
  const isLoaded = useRbacStore((state) => state.isLoaded);

  // Fetch user permissions when authenticated
  const { isLoading } = useUserPermissions();

  // Clear permissions when user logs out
  useEffect(() => {
    if (!isAuthenticated || !user) {
      clearPermissions();
    }
  }, [isAuthenticated, user, clearPermissions]);

  if (isLoading && !isLoaded) {
    return (
      <div className="w-full h-screen flex gap-x-6">
        <div className="w-md h-full md:block hidden py-6">
          <Skeleton className="h-full" />
        </div>
        <div className="flex-1 h-screen py-6 space-y-6 max-w-7xl mx-auto">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12" />
          <Skeleton className="h-6 w-3xl" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
