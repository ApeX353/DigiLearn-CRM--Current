import { create } from "zustand";
import type { z } from "zod";
import type { quoteItemSchema } from "~/api/quotes";

export interface DealModalInitialValues {
  lead_id?: string;
  school_id?: string;
  /**
   * Display-only. The modal resolves the school name from the loaded
   * lead list, which holds just the first page — on the convert path the
   * lead is often absent from it, so the caller passes the name it
   * already has rather than showing a placeholder.
   */
  school_name?: string;
  /** Seeds the product picker (rule 2) — usually the lead's product interest. */
  product_id?: string;
  quantity?: number;
  title?: string;
  description?: string;
  value?: number;
  assigned_to?: string;
  items?: z.infer<typeof quoteItemSchema>[];
  isLeadReadOnly?: boolean;
  isAssignedToReadOnly?: boolean;
  isConverting?: boolean;
}

interface AddDealModalStoreProps {
  isOpen: boolean;
  initialValues: DealModalInitialValues | null;
  onOpen: () => void;
  openWithValues: (values: DealModalInitialValues) => void;
  onClose: () => void;
}

export const useAddDealModalStore = create<AddDealModalStoreProps>()((set) => ({
  isOpen: false,
  initialValues: null,
  onOpen: () => set({ isOpen: true, initialValues: null }),
  openWithValues: (values) => set({ isOpen: true, initialValues: values }),
  onClose: () => set({ isOpen: false, initialValues: null }),
}));
