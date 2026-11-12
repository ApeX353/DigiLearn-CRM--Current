export const DOCUMENT_TYPES = ['Quote', 'Invoice', 'Deal'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
