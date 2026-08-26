export const CONTACT_ROLES = [
  'Head',
  'Deputy Head',
  'Bursar',
  'ICT Coordinator',
  'SDC Chair',
  'Finance Committee',
  'Teacher',
  'Administrator',
  'Other',
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];
