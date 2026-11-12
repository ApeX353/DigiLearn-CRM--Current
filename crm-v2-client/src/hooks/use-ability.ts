import { useContext } from "react";
import { useRbacStore } from "~/stores/use-rbac-store";
import { AbilityProviderContext } from "~/providers/ability-provider";
import type { Action, Subject } from "~/lib/abilities";

/**
 * Hook to get the CASL ability instance
 * Must be used within AbilityProvider
 */
export function useAbility() {
  const isInsideProvider = useContext(AbilityProviderContext);
  if (!isInsideProvider) {
    throw new Error("useAbility must be used within AbilityProvider");
  }
  return useRbacStore((state) => state.ability);
}

/**
 * Hook to check if user can perform an action on a subject using CASL
 * Must be used within AbilityProvider
 * @param action - The action to check (e.g., 'read', 'create', 'update', 'delete')
 * @param subject - The subject/resource (e.g., 'User', 'Course', 'Assignment')
 */
export function useCan(action: Action, subject: Subject) {
  const ability = useAbility();
  return ability.can(action, subject);
}

/**
 * Hook to check if user cannot perform an action on a subject using CASL
 * Must be used within AbilityProvider
 * @param action - The action to check
 * @param subject - The subject/resource
 */
export function useCannot(action: Action, subject: Subject) {
  const ability = useAbility();
  return ability.cannot(action, subject);
}
