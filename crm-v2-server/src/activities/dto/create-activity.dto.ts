import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsInt,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ActivityType, ActivityStatus } from '../entities/activity.entity';
import { TaskStatus, TaskPriority } from '../entities/tasks.entity';
import { CallOutcome } from '../entities/calls.entity';
import { MeetingPlatform } from '../entities/meetings.entity';
import {
  WhatsAppDirection,
  WhatsAppMessageType,
  WhatsAppMessageStatus,
} from '../entities/whats-app.entity';

// ========================
// Type-Specific DTOs
// ========================

export class CreateTaskDetailsDto {
  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.TODO })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority, default: TaskPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  estimated_hours?: number;

  @ApiPropertyOptional({ description: 'JSON array of tags' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'JSON array of checklist items' })
  @IsOptional()
  @IsString()
  checklist_items?: string;
}

export class CreateNoteDetailsDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Comma-separated or JSON tags' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Whether it is internal or client safe' })
  @IsOptional()
  @IsString()
  visibility?: string;
}

export class CreateCallDetailsDto {
  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @MaxLength(50)
  phone_number: string;

  @ApiProperty({ enum: CallOutcome })
  @IsEnum(CallOutcome)
  outcome: CallOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  outcome_id?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recording_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transcription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  follow_up_required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  follow_up_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  next_steps?: string;
}

export class CreateEmailDetailsDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  subject: string;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiProperty({ description: 'JSON: [{email, name}]' })
  @IsString()
  to_recipients: string;

  @ApiPropertyOptional({ description: 'JSON: [{email, name}]' })
  @IsOptional()
  @IsString()
  cc_recipients?: string;

  @ApiPropertyOptional({ description: 'JSON: [{email, name}]' })
  @IsOptional()
  @IsString()
  bcc_recipients?: string;

  @ApiPropertyOptional({ description: 'Defaults to the creator email when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  from_email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  message_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  in_reply_to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  thread_id?: string;
}

export class CreateMeetingDetailsDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: MeetingPlatform })
  @IsEnum(MeetingPlatform)
  platform: MeetingPlatform;

  @ApiProperty()
  @IsDateString()
  start_time: string;

  @ApiProperty()
  @IsDateString()
  end_time: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  meeting_link?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  dial_in_number?: string;

  @ApiPropertyOptional({ description: 'JSON: [{type, id, status}]' })
  @IsOptional()
  @IsString()
  attendees?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agenda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minutes_notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  recording_url?: string;
}

export class CreateWhatsAppDetailsDto {
  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @MaxLength(50)
  phone_number: string;

  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty({ enum: WhatsAppDirection })
  @IsEnum(WhatsAppDirection)
  direction: WhatsAppDirection;

  @ApiPropertyOptional({ enum: WhatsAppMessageType, default: WhatsAppMessageType.TEXT })
  @IsOptional()
  @IsEnum(WhatsAppMessageType)
  message_type?: WhatsAppMessageType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  media_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnail_url?: string;

  @ApiPropertyOptional({ enum: WhatsAppMessageStatus })
  @IsOptional()
  @IsEnum(WhatsAppMessageStatus)
  status?: WhatsAppMessageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  thread_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  follow_up_required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  follow_up_date?: string;
}

// ========================
// Main Activity DTO
// ========================

export class CreateActivityDto {
  @ApiProperty({ enum: ActivityType })
  @IsEnum(ActivityType)
  type: ActivityType;

  @ApiPropertyOptional({ enum: ActivityStatus, default: ActivityStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiProperty({ example: 'Follow up call with client' })
  @IsString()
  @MaxLength(255)
  subject: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contact_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigned_to_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_at?: string;

  @ApiPropertyOptional({ description: 'Duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;

  // Type-specific details
  @ApiPropertyOptional({ type: CreateTaskDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTaskDetailsDto)
  task?: CreateTaskDetailsDto;

  @ApiPropertyOptional({ type: CreateNoteDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateNoteDetailsDto)
  note?: CreateNoteDetailsDto;

  @ApiPropertyOptional({ type: CreateCallDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCallDetailsDto)
  call?: CreateCallDetailsDto;

  @ApiPropertyOptional({ type: CreateEmailDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmailDetailsDto)
  email?: CreateEmailDetailsDto;

  @ApiPropertyOptional({ type: CreateMeetingDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMeetingDetailsDto)
  meeting?: CreateMeetingDetailsDto;

  @ApiPropertyOptional({ type: CreateWhatsAppDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateWhatsAppDetailsDto)
  whatsapp?: CreateWhatsAppDetailsDto;
}
