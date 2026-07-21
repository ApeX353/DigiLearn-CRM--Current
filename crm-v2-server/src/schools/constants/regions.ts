export const REGIONS = ['urban', 'rural'] as const;
export type Region = (typeof REGIONS)[number];