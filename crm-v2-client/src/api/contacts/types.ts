import z from "zod";
import type { School } from "../schools";
export const CONTACT_ROLES = [
  "Head",
  "Deputy Head",
  "Bursar",
  "ICT Coordinator",
  "SDC Chair",
  "Finance Committee",
  "Teacher",
  "Administrator",
  "Procurement",
  "Other",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];
export const PREFERRED_CONTACT_METHODS = [
  "Email",
  "Phone",
  "WhatsApp",
  "SMS",
] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  is_primary: boolean;
  email?: string;
  phone?: string;
  whatsapp_number?: string;
  preferred_contact_method?: PreferredContactMethod;
  notes?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  role?: ContactRole;
  school: School;
}

export const createContactSchema = z.object({
  id: z.string().optional(),
  contact_id: z.string().optional(),
  title: z.string().optional(),
  first_name: z.string().min(2, "First name is required"),
  last_name: z.string().min(2, "Last name is required"),
  email: z.email("Invalid email").optional(),
  phone: z.string().optional(),
  whatsapp_number: z.string().optional(),
  is_primary: z.boolean(),
  notes: z.string().optional(),
  role: z.enum(CONTACT_ROLES),
  preferred_contact_method: z.enum(PREFERRED_CONTACT_METHODS),
});

export type AddContactValues = z.infer<typeof createContactSchema>
