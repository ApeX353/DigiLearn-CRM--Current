import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { WhatsAppDirection } from '../../activities/entities/whats-app.entity';

/**
 * One normalized WhatsApp message from an export / Business-API webhook.
 * The EXTERNAL connector (out of session — needs WhatsApp Business API
 * access + privacy review) is responsible for resolving a phone number
 * to `leadId` and supplying a stable `externalId` for dedupe.
 */
export class IngestWhatsAppMessageDto {
  /** Provider message id — used for idempotent dedupe. */
  @IsString()
  externalId: string;

  /** CRM lead this message belongs to. Rows without it are skipped. */
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsString()
  phone: string;

  @IsString()
  body: string;

  @IsEnum(WhatsAppDirection)
  direction: WhatsAppDirection;

  /** ISO timestamp the message was sent/received. */
  @IsISO8601()
  timestamp: string;
}

export class IngestWhatsAppDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestWhatsAppMessageDto)
  messages: IngestWhatsAppMessageDto[];
}
