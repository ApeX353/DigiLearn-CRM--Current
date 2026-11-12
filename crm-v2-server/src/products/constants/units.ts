export const UNITS = [
  'piece',
  'kilogram',
  'gram',
  'use',
  'litre',
  'hour',
  'metre',
] as const;

export type Unit = (typeof UNITS)[number];
