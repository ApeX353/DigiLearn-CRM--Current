export const SCHOOL_TYPES = [
  "Primary",
  "Secondary",
  "ECD Centre",
  "College",
  "Other",
] as const;
export type SchoolType = (typeof SCHOOL_TYPES)[number];