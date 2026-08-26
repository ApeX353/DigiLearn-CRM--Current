import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class EmailTemplateVariableDto {
  @ApiProperty({
    example: 'lead.lead_name',
    description: 'Dot-path into the merge-var scope.',
  })
  @IsString()
  key: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;
}

export class CreateEmailTemplateDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  slug: string;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  subject: string;

  @ApiProperty()
  @IsString()
  body_html: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body_text?: string;

  @ApiPropertyOptional({ type: [EmailTemplateVariableDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailTemplateVariableDto)
  variables?: EmailTemplateVariableDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    description:
      'Admins only: set true to share the template with the whole org. Ignored otherwise.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_shared?: boolean;
}

export class UpdateEmailTemplateDto extends PartialType(
  CreateEmailTemplateDto,
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
