export type FileProvider = "vercel" | "cloudinary" | "aws" | (string & {});

export type FileEntityType =
  | "lead"
  | "deal"
  | "school"
  | "quote"
  | "invoice"
  | (string & {});

export type FileMetadata = Record<string, unknown>;

export interface FileRecord {
  id: string;
  file_name: string;
  file_url: string;
  provider: FileProvider;
  entity_type: FileEntityType;
  entity_id: string;
  file_type?: string;
  file_size?: number;
  metadata?: FileMetadata;
  created_at?: string;
  updated_at?: string;
}

export type CreateFilePayload = Omit<
  FileRecord,
  "id" | "created_at" | "updated_at"
>;

export const ALLOWED_CONTENT_TYPES = [
  {
    type: "application/pdf",
    extensions: ["pdf"],
    isAllowed: true,
  },
  {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    isAllowed: true,
  },
  {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: ["xlsx"],
    isAllowed: true,
  },
  {
    type: "image/jpeg",
    extensions: ["jpg", "jpeg"],
    isAllowed: true,
  },
  {
    type: "image/png",
    extensions: ["png"],
    isAllowed: true,
  },
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
