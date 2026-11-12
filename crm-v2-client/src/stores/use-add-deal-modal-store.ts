import { create } from "zustand";
import type { z } from "zod";
import type { quoteItemSchema } from "~/api/quotes";

export interface DealModalInitialValues {
  lead_id?: string;
  school_id?: string;
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
