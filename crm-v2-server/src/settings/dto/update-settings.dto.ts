import { IsOptional, IsString, IsEmail, IsUrl, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SocialMediaDto {
  @ApiProperty({ required: false, example: 'https://facebook.com/digilearn' })
  @IsOptional()
  @IsUrl()
  facebook?: string;

  @ApiProperty({ required: false, example: 'https://twitter.com/digilearn' })
  @IsOptional()
  @IsUrl()
  twitter?: string;

  @ApiProperty({ required: false, example: 'https://linkedin.com/company/digilearn' })
  @IsOptional()
  @IsUrl()
  linkedin?: string;

  @ApiProperty({ required: false, example: 'https://instagram.com/digilearn' })
  @IsOptional()
  @IsUrl()
  instagram?: string;

  @ApiProperty({ required: false, example: 'https://youtube.com/@digilearn' })
  @IsOptional()
  @IsUrl()
  youtube?: string;
}

export class BusinessHoursDto {
  @ApiProperty({ required: false, example: '8:00 AM - 5:00 PM' })
  @IsOptional()
  @IsString()
  monday?: string;

  @ApiProperty({ required: false, example: '8:00 AM - 5:00 PM' })
  @IsOptional()
  @IsString()
  tuesday?: string;

  @ApiProperty({ required: false, example: '8:00 AM - 5:00 PM' })
  @IsOptional()
  @IsString()
  wednesday?: string;

  @ApiProperty({ required: false, example: '8:00 AM - 5:00 PM' })
  @IsOptional()
  @IsString()
  thursday?: string;

  @ApiProperty({ required: false, example: '8:00 AM - 5:00 PM' })
  @IsOptional()
  @IsString()
  friday?: string;

  @ApiProperty({ required: false, example: '8:00 AM - 12:00 PM' })
  @IsOptional()
  @IsString()
  saturday?: string;

  @ApiProperty({ required: false, example: 'Closed' })
  @IsOptional()
  @IsString()
  sunday?: string;
}

export class UpdateSettingsDto {
  @ApiProperty({ required: false, example: 'DigiLearn School Management System' })
  @IsOptional()
  @IsString()
  site_name?: string;

  @ApiProperty({ required: false, example: '123 School Street, Education City, EC 12345' })
  @IsOptional()
  @IsString()
  primary_address?: string;

  @ApiProperty({ required: false, example: 'P.O. Box 456, Education City, EC 12345' })
  @IsOptional()
  @IsString()
  secondary_address?: string;

  @ApiProperty({ required: false, example: 'info@digilearn.school' })
  @IsOptional()
  @IsEmail()
  primary_email?: string;

  @ApiProperty({ required: false, example: 'support@digilearn.school' })
  @IsOptional()
  @IsEmail()
  secondary_email?: string;

  @ApiProperty({ required: false, example: '1-800-DIGILEARN' })
  @IsOptional()
  @IsString()
  helpline?: string;

  @ApiProperty({ required: false, example: '+1-555-123-4567' })
  @IsOptional()
  @IsString()
  primary_phone?: string;

  @ApiProperty({ required: false, example: '+1-555-123-4568' })
  @IsOptional()
  @IsString()
  secondary_phone?: string;

  @ApiProperty({ required: false, example: '+1-555-123-4569' })
  @IsOptional()
  @IsString()
  fax?: string;

  @ApiProperty({ required: false, example: 'https://www.digilearn.school' })
  @IsOptional()
  @IsUrl()
  website?: string;

  @ApiProperty({ required: false, example: 'Leading school management system providing quality education' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, type: SocialMediaDto })
  @IsOptional()
  @IsObject()
  social_media?: SocialMediaDto;

  @ApiProperty({ required: false, type: BusinessHoursDto })
  @IsOptional()
  @IsObject()
  business_hours?: BusinessHoursDto;
}
