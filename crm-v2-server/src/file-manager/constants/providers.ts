export const STORAGE_PROVIDERS = [
  'vercel',
  'cloudinary',
  'aws',
  'azure',
  'other',
] as const;

export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

export const FILE_ENTITY_TYPES = [
  'lead',
  'deal',
  'school',
  'contact',
  'invoice',
  'quote',
] as const;

export type FileEntityType = (typeof FILE_ENTITY_TYPES)[number];
