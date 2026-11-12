import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';

export const MAX_SCREENSHOT_BYTES = 1024 * 1024;
export interface ScreenshotUpload {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export function validateScreenshots(files: ScreenshotUpload[]) {
  if (files.length > 3)
    throw new BadRequestException('Maximum three screenshots per ticket');
  return files.map((file) => {
    const b = file.buffer;
    if (!b?.length) throw new BadRequestException('Screenshot is empty');
    if (b.length > MAX_SCREENSHOT_BYTES)
      throw new PayloadTooLargeException(
        'Each screenshot must be 1 MiB or smaller',
      );
    let width = 0,
      height = 0;
    if (
      file.mimetype === 'image/png' &&
      b.length >= 24 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      b.toString('ascii', 12, 16) === 'IHDR'
    ) {
      width = b.readUInt32BE(16);
      height = b.readUInt32BE(20);
    } else if (file.mimetype === 'image/jpeg' && b[0] === 255 && b[1] === 216) {
      let offset = 2;
      while (offset + 3 < b.length) {
        if (b[offset++] !== 255) break;
        while (b[offset] === 255) offset++;
        const marker = b[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > b.length) break;
        const length = b.readUInt16BE(offset);
        if (length < 2 || offset + length > b.length) break;
        if ([192, 193, 194].includes(marker) && length >= 8) {
          height = b.readUInt16BE(offset + 3);
          width = b.readUInt16BE(offset + 5);
          break;
        }
        offset += length;
      }
    }
    if (
      !width ||
      !height ||
      width > 4096 ||
      height > 4096 ||
      width * height > 16000000
    )
      throw new BadRequestException(
        'Use a valid PNG/JPG screenshot, at most 4096 pixels per side',
      );
    const name = file.originalname.replace(/\\/g, '/').split('/').pop()?.trim();
    if (!name || name.length > 200 || /[\x00-\x1f\x7f]/.test(name))
      throw new BadRequestException('Invalid screenshot name');
    return {
      name,
      type: file.mimetype,
      bytes: b,
      sha256: createHash('sha256').update(b).digest('hex'),
    };
  });
}

export async function insertScreenshots(
  manager: EntityManager,
  bugId: string,
  userId: string,
  files: ReturnType<typeof validateScreenshots>,
) {
  for (const [index, file] of files.entries()) {
    await manager.query(
      `INSERT INTO bug_report_screenshots
      (bug_report_id,slot,file_name,file_type,file_size,sha256,content,uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        bugId,
        index + 1,
        file.name,
        file.type,
        file.bytes.length,
        file.sha256,
        file.bytes,
        userId,
      ],
    );
  }
}
