import { create } from "zustand";

/**
 * Breadcrumb label override.
 *
 * Detail routes (e.g. /leads/:id) have no entry in NavigationConfig, so the
 * top breadcrumb used to fall back to the last URL segment — the raw record
 * UUID. A detail page publishes its human-readable name here on load and
 * clears it on unmount; the dashboard layout renders this label instead of
 * the UUID for id-style routes.
 */
interface BreadcrumbState {
  label: string | null;
  setLabel: (label: string | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  label: null,
  setLabel: (label) => set({ label }),
}));
