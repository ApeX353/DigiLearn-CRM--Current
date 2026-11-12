import { type Consumer, createContext, useContext, type ReactNode } from "react";
import { create } from "zustand";
import { createContextualCan } from "@casl/react";
import { useRbacStore } from "~/stores/use-rbac-store";
import type { AppAbility } from "~/lib/abilities";

// Create a Zustand store for the ability provider context
interface AbilityProviderState {
  ability: AppAbility | null;
  setAbility: (ability: AppAbility) => void;
}

const useAbilityProviderStore = create<AbilityProviderState>((set) => ({
  ability: null,
  setAbility: (ability: AppAbility) => set({ ability }),
}));

// Create a React context to provide the ability
export const AbilityProviderContext = createContext<AppAbility | null>(null);

// Create the Can component for declarative permission checks
export const Can = createContextualCan(AbilityProviderContext.Consumer as Consumer<AppAbility>);

/**
 * Provider component that supplies CASL ability to the React tree using Zustand
 */
export function AbilityProvider({ children }: { children: ReactNode }) {
  const ability = useRbacStore((state) => state.ability);

  // Sync RBAC store ability to provider store
  useAbilityProviderStore.setState({ ability });

  return (
    <AbilityProviderContext.Provider value={ability}>
      {children}
    </AbilityProviderContext.Provider>
  );
}

/**
 * Hook to use the ability from the provider
 * Must be used within AbilityProvider
 */
export function useAbilityContext() {
  const ability = useContext(AbilityProviderContext);
  if (!ability) {
    throw new Error("useAbilityContext must be used within AbilityProvider or ability is not yet initialized");
  }

  return ability;
}
