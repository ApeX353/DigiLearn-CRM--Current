import z from "zod";

export const PRODUCT_TYPES = ["product", "service"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_UNITS = [
  "piece",
  "kilogram",
  "gram",
  "use",
  "litre",
  "hour",
  "metre",
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export interface Product {
  id: string;
  product_type: ProductType;
  name: string;
  /** Catalogue code, e.g. DLR-E-Y1. */
  sku: string | null;
  /** Sales description — prefills document line items on selection. */
  description: string | null;
  category: string | null;
  price: number;
  discount: number;
  tax: number;
  unit: ProductUnit;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const createProductSchema = z.object({
  product_type: z.enum(PRODUCT_TYPES),
  name: z.string().min(1, "Name is required").max(255),
  sku: z.string().max(64).optional(),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  price: z.number().min(0, "Price must be positive"),
  discount: z.number().min(0),
  tax: z.number().min(0),
  unit: z.enum(PRODUCT_UNITS),
  is_active: z.boolean(),
});

export const updateProductSchema = createProductSchema.partial();

export type CreateProductValues = z.infer<typeof createProductSchema>;
export type UpdateProductValues = z.infer<typeof updateProductSchema>;

