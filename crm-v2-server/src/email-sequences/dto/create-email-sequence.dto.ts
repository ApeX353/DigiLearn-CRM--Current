import { IsString, IsArray, IsBoolean, IsOptional, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EmailSequenceStepDto {
  @ApiProperty({ description: 'Delay in hours before sending this step' })
  @IsNumber()
  delay_hours: number;

  @ApiProperty({ description: 'Email template name' })
  @IsString()
  template_name: string;

  @ApiProperty({ description: 'Email subject line' })
  @IsString()
  subject: string;
}

export class CreateEmailSequenceDto {
  @ApiProperty({ description: 'Sequence name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Trigger event (e.g., lead_status_change_to_Qualified)' })
  @IsString()
  trigger_event: string;

  @ApiProperty({ type: [EmailSequenceStepDto], description: 'Sequence steps' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailSequenceStepDto)
  steps: EmailSequenceStepDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
