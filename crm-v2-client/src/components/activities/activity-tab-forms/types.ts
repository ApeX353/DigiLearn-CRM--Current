import type { CreateActivityDto } from "~/api/activities/types";
import type { Contact } from "~/api/contacts";

/**
 * Imperative handle exposed by each tab form via forwardRef.
 * The parent uses this to trigger validation and extract values.
 */
export interface TabFormHandle {
  trigger: () => Promise<boolean>;
  getValues: () => TabFormPayload;
  reset: () => void;
}

/**
 * The partial payload a tab form produces.
 * Excludes fields the parent manages: type, lead_id, deal_id, contact_id.
 */
export interface TabFormPayload {
  subject: string;
  description?: string;
  assigned_to_id?: string;
  due_at?: string;
  duration?: number;
  note?: CreateActivityDto["note"];
  task?: CreateActivityDto["task"];
  call?: CreateActivityDto["call"];
  email?: CreateActivityDto["email"];
  meeting?: CreateActivityDto["meeting"];
  whatsapp?: CreateActivityDto["whatsapp"];
  demo?: CreateActivityDto["demo"];
  /**
   * The Demo tab form selects which subtype to submit (booking /
   * delivery / followup) inside its own state. The modal reads this
   * to set CreateActivityDto.type when the user submits.
   */
  __demoType?: "demo_booking" | "demo_delivery" | "demo_followup";
}

/**
 * Base props passed from CreateActivityModal to every tab form.
 */
export interface ActivityTabFormProps {
  leadId?: string;
  dealId?: string;
}

/**
 * Props for tabs needing a single contact (call, whatsapp).
 */
export interface SingleContactTabFormProps extends ActivityTabFormProps {
  selectedContact?: Contact;
  onActionDataChange?: (data: Record<string, string>) => void;
}

/**
 * Props for tabs needing multiple contacts (email, meeting).
 */
export interface MultiContactTabFormProps extends ActivityTabFormProps {
  selectedContacts?: Contact[];
  onActionDataChange?: (data: Record<string, string>) => void;
}
