import { useRbacStore } from "~/stores/use-rbac-store";

interface FeatureGuardProps {
  allowedRoles: string[];
  isActive?: boolean;
  children: React.ReactNode;
}

export const FeatureGuard = ({
  allowedRoles,
  isActive = true,
  children,
}: FeatureGuardProps) => {
  const hasAnyRoles = useRbacStore((state) => state.hasAnyRole);

  const isAllowed = hasAnyRoles(allowedRoles);

  if (!isActive) {
    return null;
  }

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
};
