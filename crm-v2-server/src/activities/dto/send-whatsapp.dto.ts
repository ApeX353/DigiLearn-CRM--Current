import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { WHATSAPP_TEMPLATE_NAMES } from '../constants/whatsapp-templates';
import type { WhatsAppTemplateName } from '../constants/whatsapp-templates';

/**
 * Body of POST /activities/whatsapp/send.
 *
 * This route used to take a plain TypeScript interface, so the global
 * ValidationPipe had nothing to validate against: a body without `leadId`
 * reached the service and produced a WhatsApp activity with no lead
 * (observed on staging, 14 Oct 2026). With a class the pipe rejects it.
 */
export class SendWhatsAppDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  leadId: string;

  @ApiProperty({ example: '+263771234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contactPhone: string;

  @ApiProperty({ enum: WHATSAPP_TEMPLATE_NAMES, example: 'demo_followup' })
  @IsIn(WHATSAPP_TEMPLATE_NAMES as readonly string[])
  templateName: WhatsAppTemplateName;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, string>;
}
