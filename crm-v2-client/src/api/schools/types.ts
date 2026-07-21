import z from "zod";
import { createContactSchema, type Contact } from "../contacts";
import type { Deal } from "../deals";
import type { Lead } from "../leads";

export const CHURCH_DENOMINATIONS = [
  "Roman Catholic",
  "Anglican",
  "Seventh-Day Adventist (SDA)",
  "Methodist",
  "Evangelical Lutheran (ELCZ)",
  "Brethren in Christ (BICC)",
  "Salvation Army",
  "Reformed Church in Zimbabwe (RCZ)",
  "Dutch Reformed Church (DRC / NG Kerk)",
  "United Methodist Church",
  "Apostolic Faith Mission (AFM)",
  "ZAOGA / FIF",
  "Church of Christ",
  "Johane Marange Apostolic",
  "Johane Masowe Apostolic",
  "Other Christian Mission",
  "Other",
] as const;
export type ChurchDenomination = (typeof CHURCH_DENOMINATIONS)[number];
export const OWNERSHIP_TYPES = [
  "Government",
  "Council School",
  "Mission / Church",
  "Private Independent",
  "Community / SDC",
  "Other",
] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];
export const PROVINCES = [
  "Harare",
  "Bulawayo",
  "Masvingo",
  "Midlands",
  "Manicaland",
  "Mashonaland East",
  "Mashonaland Central",
  "Mashonaland West",
  "Matebeleland South",
  "Matebeleland North",
] as const;

export type Province = (typeof PROVINCES)[number];

export const DISTRICTS_BY_PROVINCE: Record<Province, string[]> = {
  Bulawayo: ["Bulawayo"],
  Harare: ["Harare", "Chitungwiza", "Epworth"],
  Manicaland: [
    "Mutare",
    "Mutasa",
    "Makoni",
    "Nyanga",
    "Buhera",
    "Chipinge",
    "Chimanimani",
  ],
  "Mashonaland East": [
    "Marondera",
    "UMP (Uzumba-Maramba-Pfungwe)",
    "Goromonzi",
    "Murehwa",
    "Mutoko",
    "Wedza",
    "Mudzi",
    "Seke",
  ],
  "Mashonaland West": [
    "Chegutu",
    "Kadoma",
    "Zvimba",
    "Kariba",
    "Hurungwe",
    "Makonde",
    "Mhondoro-Ngezi",
    "Sanyati",
  ],
  "Mashonaland Central": [
    "Bindura",
    "Mazowe",
    "Guruve",
    "Mt Darwin",
    "Shamva",
    "Rushinga",
    "Muzarabani",
  ],
  Masvingo: [
    "Masvingo",
    "Mwenezi",
    "Chivi",
    "Chiredzi",
    "Zaka",
    "Bikita",
    "Gutu",
  ],
  Midlands: [
    "Gweru",
    "Kwekwe",
    "Shurugwi",
    "Chirumhanzu",
    "Gokwe North",
    "Gokwe South",
    "Zvishavane",
    "Mberengwa",
  ],
  "Matebeleland North": [
    "Binga",
    "Hwange",
    "Lupane",
    "Nkayi",
    "Tsholotsho",
    "Umguza",
    "Bubi",
  ],
  "Matebeleland South": [
    "Gwanda",
    "Beitbridge",
    "Insiza",
    "Matobo",
    "Bulilima",
    "Mangwe",
    "Umzingwane",
  ],
};
export const REGIONS = ["urban", "rural"] as const;
export type Region = (typeof REGIONS)[number];
export const SCHOOL_TYPES = [
  "Primary",
  "Secondary",
  "ECD Centre",
  "College",
  "Other",
] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];
export interface School {
  id: string;
  name: string;
  school_type: SchoolType;
  church_denomination: ChurchDenomination;
  ownership_type: OwnershipType;
  website?: string;
  address: string;
  city: string;
  province: Province;
  district: string;
  region: Region;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  principal_name: string;
  student_count?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
  contacts?: Contact[];
  leads?: Lead[];
  deals?: Deal[];
}

export const schoolInfoSchema = z.object({
  name: z.string().min(2, "School name is required"),
  school_type: z.enum(SCHOOL_TYPES),
  ownership_type: z.enum(OWNERSHIP_TYPES),
  church_denomination: z.enum(CHURCH_DENOMINATIONS).optional(),
  // website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(1, "City is required"),
  province: z.enum(PROVINCES),
  district: z.string().optional(),
  region: z.enum(REGIONS),
  student_count: z.number().min(0).optional(),
});

export const contactsSchema = z
  .array(createContactSchema)
  .min(1, "At least one contact is required");

export const createSchoolSchema = z.object({
  school: schoolInfoSchema,
  contacts: contactsSchema,
});

export type AddSchoolValues = z.infer<typeof createSchoolSchema>;

export const updateSchoolSchema = z.object({
  name: z.string().min(2, "School name is required"),
  school_type: z.enum(SCHOOL_TYPES),
  ownership_type: z.enum(OWNERSHIP_TYPES),
  church_denomination: z.enum(CHURCH_DENOMINATIONS).optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(1, "City is required"),
  province: z.enum(PROVINCES),
  district: z.string().optional(),
  region: z.enum(REGIONS),
  phone: z.string().optional(),
  email: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  principal_name: z.string().optional(),
  student_count: z.number().min(0).optional(),
  // is_active: z.boolean(),
});

export type UpdateSchoolValues = z.infer<typeof updateSchoolSchema>;

export interface SchoolStats {
  activeDeals: {
    count: number;
    totalValue: number;
  };
  openQuotes: {
    count: number;
    totalValue: number;
  };
  deals: {
    count: number;
    totalValue: number;
  };
  outstandingInvoices: {
    count: number;
    totalValue: number;
  };
}
