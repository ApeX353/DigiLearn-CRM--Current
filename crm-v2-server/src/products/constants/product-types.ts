export const PRODUCT_TYPES = ['product', 'service'] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];
