export const ALLOWED_CONTENT_TYPES = [
    {
        type: 'application/pdf',
        extensions: ['pdf'],
        isAllowed: true,
    },
    {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        extensions: ['docx'],
        isAllowed: true,
    },
    {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extensions: ['xlsx'],
        isAllowed: true,
    },
    {
        type: 'image/jpeg',
        extensions: ['jpg', 'jpeg'],
        isAllowed: true,
    },
    {
        type: 'image/png', 
        extensions: ['png'],
        isAllowed: true,
    },
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];