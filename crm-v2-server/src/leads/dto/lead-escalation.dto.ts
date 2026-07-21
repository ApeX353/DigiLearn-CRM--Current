import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EscalationReason,
  EscalationResolution,
} from '../entities/lead-escalation.entity';

export class CreateLeadEscalationDto {
  @ApiProperty({ enum: EscalationReason })
  @IsEnum(EscalationReason)
  reason: EscalationReason;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockers?: string;
}

export class ResolveLeadEscalationDto {
  @ApiProperty({ enum: EscalationResolution })
  @IsEnum(EscalationResolution)
  resolution: EscalationResolution;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution_notes?: string;
}
