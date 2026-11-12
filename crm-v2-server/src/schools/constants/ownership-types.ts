export const OWNERSHIP_TYPES = [
  "Government",
  "Council School",
  "Mission / Church",
  "Private Independent",
  "Community / SDC",
  "Other",
] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];