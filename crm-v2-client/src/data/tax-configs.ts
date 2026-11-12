export const TAX_CONFIG = [
  { label: "No Tax", value: 0 },
  { label: "VAT 5%", value: 5 },
  { label: "VAT 15%", value: 15.5 },
  { label: "GST 7%", value: 7 },
] as const;

export type TaxConfig = (typeof TAX_CONFIG)[number];
