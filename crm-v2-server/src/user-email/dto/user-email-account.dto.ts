import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserEmailProvider } from '../entities/user-email-account.entity';

/**
 * Creating a sending account. We only support SMTP from day one; the
 * OAuth tiers (gmail, microsoft) land alongside the calendar-sync
 * module where the same token wallet is already in play.
 *
 * The secret fields (username, password) are accepted here in
 * cleartext over HTTPS and encrypted by the service before persistence.
 * They never appear in any entity select.
 */
export class CreateSmtpAccountDto {
  @ApiProperty({ example: 'rep@acme.com' })
  @IsEmail()
  email_address: string;

  @ApiPropertyOptional({ example: 'Jane Rep (Acme Sales)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  display_name?: string;

  @ApiProperty({ example: 'smtp.gmail.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host: string;

  @ApiProperty({ example: 587, minimum: 1, maximum: 65535 })
  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Use implicit TLS (port 465). Most modern SMTP uses STARTTLS on 587 — leave false.',
  })
  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @ApiProperty({ example: 'rep@acme.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  username: string;

  @ApiProperty({ example: 'app-specific-password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  password: string;

  @ApiPropertyOptional({
    description:
      'Mark this account as the default sender. The previous default is demoted automatically.',
  })
  @IsOptional()
  @IsBoolean()
  make_default?: boolean;
}

/**
 * Patch DTO — limited to toggling active/default for now. Rotating
 * credentials is a delete + re-create by design; that forces the user
 * to re-enter the password and keeps us from accidentally encrypting
 * with stale keys after a rotation.
 */
export class UpdateUserEmailAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  display_name?: string;
}

/**
 * Public-safe view of a sending account — never includes the
 * ciphertext. What the UI shows.
 */
export interface UserEmailAccountPublic {
  id: string;
  user_id: string;
  provider: UserEmailProvider;
  email_address: string;
  display_name: string | null;
  is_default: boolean;
  is_active: boolean;
  last_verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Fallback enum import so this file can be used as a single DTO import
 * in controllers without pulling the entity directly.
 */
export { UserEmailProvider };

/**
 * Sending a one-off email through the user's chosen account. `body_html`
 * wins when both are provided; `body_text` is still stored because some
 * inboxes (notably many Android clients) prefer the plain part.
 */
export class SendUserEmailDto {
  // L-05: recipients must be real addresses and capped, so a malformed or
  // runaway list can't reach the mailer.
  @ApiProperty({ type: [String], example: ['lead@example.com'] })
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  to: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  cc?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  bcc?: string[];

  @ApiProperty({ example: 'Follow-up: Acme Demo' })
  @IsString()
  @MaxLength(500)
  subject: string;

  @ApiProperty({ example: '<p>Hi Jane,</p>' })
  @IsString()
  body_html: string;

  @ApiPropertyOptional({ example: 'Hi Jane, ...' })
  @IsOptional()
  @IsString()
  body_text?: string;

  @ApiPropertyOptional({
    description:
      'Optional sending account. If omitted the user default is used.',
  })
  @IsOptional()
  @IsString()
  account_id?: string;

  @ApiPropertyOptional({
    description:
      'Optional activity this send is associated with — for cross-linking in the feed.',
  })
  @IsOptional()
  @IsString()
  activity_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contact_id?: string;
}

/**
 * Variant that renders a saved template before sending. Keeps the
 * rendered-then-sent path atomic server-side so the UI can't drift out
 * of step.
 */
export class SendWithTemplateDto {
  // L-05: same recipient hygiene as the one-off send path.
  @ApiProperty({ type: [String] })
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  to: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  cc?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsEmail({}, { each: true })
  @ArrayMaxSize(100)
  bcc?: string[];

  @ApiProperty()
  @IsString()
  template_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  account_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lead_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contact_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  activity_id?: string;
}

/**
 * Ad-hoc SMTP send test — `verify()` on the transporter only checks
 * that the connection opens, it doesn't prove mail relays. Letting the
 * user send a test to themselves closes that gap in 30 seconds.
 */
export class SendTestEmailDto {
  @ApiPropertyOptional({
    example: 'me@acme.com',
    description:
      'Where to deliver the test. Defaults to the account email_address.',
  })
  @IsOptional()
  @IsEmail()
  to?: string;
}
