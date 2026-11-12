import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { NotificationChannel } from '../entities/notification-preference.entity';

/**
 * Validated bodies for /notification-preferences. Until 11 Sep 2026 the
 * handlers took bare interfaces, so `event_type: not_a_real_event,
 * channel: carrier_pigeon, severity_min: bogus` was stored with a 201
 * (BUG-030, AUDIT_COVERAGE_V2.md).
 *
 * Channel and severity are closed lists and are checked as such. There is
 * no registry of event types anywhere in the codebase — the only reader is
 * the follow-up reminder job, which looks a preference up by the key it
 * emits — so `event_type` is checked for shape (an identifier, not free
 * text) rather than against a list. A registry is the right next step and
 * belongs with the notification-shape redesign the owner asked for.
 */
export const NOTIFICATION_PREFERENCE_CHANNELS = [
  'email',
  'sms',
  'push',
  'in_app',
] as const satisfies readonly NotificationChannel[];

/**
 * The Settings page and the notifications table spell the in-app channel
 * `in-app`; preferences store `in_app`, which is what the follow-up reminder
 * looks up (followup-reminder.service.ts). Both spellings are accepted on
 * the way in and the canonical one is stored, so a toggle saved from the
 * page is the row the reader finds.
 */
export const ACCEPTED_CHANNEL_SLUGS = [
  ...NOTIFICATION_PREFERENCE_CHANNELS,
  'in-app',
] as const;
export const normalizeChannel = (value: unknown): NotificationChannel =>
  (value === 'in-app' ? 'in_app' : value) as NotificationChannel;

export const NOTIFICATION_PREFERENCE_SEVERITIES = [
  'info',
  'warning',
  'critical',
] as const;
export type NotificationPreferenceSeverity =
  (typeof NOTIFICATION_PREFERENCE_SEVERITIES)[number];

const EVENT_TYPE_SHAPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_PREFERENCE_SEVERITIES })
  @IsOptional()
  @IsIn(NOTIFICATION_PREFERENCE_SEVERITIES)
  severity_min?: NotificationPreferenceSeverity;
}

export class CreateNotificationPreferenceDto {
  @ApiProperty({ example: 'followup_reminder', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(EVENT_TYPE_SHAPE, {
    message:
      'event_type must be an identifier such as followup_reminder (lower-case letters, digits, _ . -)',
  })
  event_type: string;

  @ApiProperty({ enum: NOTIFICATION_PREFERENCE_CHANNELS })
  @Transform(({ value }) => normalizeChannel(value))
  @IsIn(NOTIFICATION_PREFERENCE_CHANNELS)
  channel: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  is_enabled: boolean;

  @ApiPropertyOptional({ enum: NOTIFICATION_PREFERENCE_SEVERITIES })
  @IsOptional()
  @IsIn(NOTIFICATION_PREFERENCE_SEVERITIES)
  severity_min?: NotificationPreferenceSeverity;
}
