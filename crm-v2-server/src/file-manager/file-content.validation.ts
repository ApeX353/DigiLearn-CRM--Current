import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { ALLOWED_CONTENT_TYPES } from './constants/allowed-content-types';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function safeFileName(name: string): string {
  const cleaned = name.replace(/\\/g, '/').split('/').pop()?.trim() || '';
  if (!cleaned || cleaned.length > 255 || /[\x00-\x1f\x7f]/.test(cleaned)) {
    throw new BadRequestException('Invalid file name');
  }
  return cleaned;
}

/** Signature checks are a format guard, not antivirus. Downloads are attachments. */
export function validateFileContent(
  name: string,
  mime: string,
  buffer: Buffer,
) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BadRequestException('A non-empty file is required');
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new PayloadTooLargeException('Files must be 10 MiB or smaller');
  }
  const fileName = safeFileName(name);
  const extension = fileName.split('.').pop()?.toLowerCase();
  const allowed = ALLOWED_CONTENT_TYPES.find((entry) =>
    (entry.extensions as readonly string[]).includes(extension || ''),
  );
  // Some browsers provide no MIME for Office documents; infer only from the
  // allowlisted extension and still check the signature below.
  if (
    !allowed ||
    (mime && mime !== 'application/octet-stream' && mime !== allowed.type)
  ) {
    throw new BadRequestException(
      'Supported files: PDF, DOCX, XLSX, JPG and PNG',
    );
  }
  const signature =
    allowed.type === 'application/pdf'
      ? Buffer.from('%PDF-')
      : allowed.type === 'image/png'
        ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        : allowed.type === 'image/jpeg'
          ? Buffer.from([255, 216, 255])
          : Buffer.from([80, 75, 3, 4]);
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new BadRequestException('File contents do not match its type');
  }
  return { fileName, contentType: allowed.type };
}
