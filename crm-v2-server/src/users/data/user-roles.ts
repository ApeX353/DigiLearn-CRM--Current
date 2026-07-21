export const UserRoles = [
  'admin',
  'manager',
  'sales_manager',
  'sale_rep',
] as const;

export type UserRole = (typeof UserRoles)[number];
