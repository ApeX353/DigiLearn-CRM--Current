import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "~/stores/use-auth-store";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoggedIn, isAuthChecking, requiresPasswordChange } =
    useAuthStore();
  const location = useLocation();

  if (isAuthChecking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Checking session...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // A mandated password change used to be advisory: login sent the user to
  // /change-password once, and any other link worked. Keep them on the
  // password form (the profile page hosts it) until the flag clears
  // (tracker AUD-H02).
  const onPasswordPage =
    location.pathname === "/change-password" ||
    location.pathname === "/profile";
  if (requiresPasswordChange && !onPasswordPage) {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
