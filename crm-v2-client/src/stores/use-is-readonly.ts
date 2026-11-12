import { create } from "zustand";
import type { DealStatus } from "~/api/deals";
import type { LeadStatus } from "~/api/leads";

interface IsReadonlyStoreState {
  isReadonly: boolean;
  setIsReadonly: (isReadonly: boolean) => void;
}

const useIsReadonlyStore = create<IsReadonlyStoreState>()((set) => ({
  isReadonly: false,
  setIsReadonly: (isReadonly: boolean) => set({ isReadonly }),
}));

const DEAL_READONLY_STATUSES = new Set<DealStatus>(["won", "lost"]);

export const isLeadReadonly = (status?: LeadStatus | string | null): boolean =>
  String(status ?? "").toLowerCase() === "converted";

export const isDealReadonly = (status?: DealStatus | string | null): boolean =>
  DEAL_READONLY_STATUSES.has(
    String(status ?? "").toLowerCase() as DealStatus,
  );

export default useIsReadonlyStore;
