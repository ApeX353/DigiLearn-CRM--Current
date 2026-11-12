import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

class Paged {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}

export class QueryJobRunsDto extends Paged {
  @ApiPropertyOptional({ description: 'Job name from the registry, e.g. sla.breach_check' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: ['running', 'ok', 'failed', 'skipped', 'lost'] })
  @IsOptional()
  @IsIn(['running', 'ok', 'failed', 'skipped', 'lost'])
  status?: string;
}

export class QueryDeliveriesDto extends Paged {
  @ApiPropertyOptional({ enum: ['whatsapp', 'email', 'sms', 'blob', 'push', 'in-app'] })
  @IsOptional()
  @IsIn(['whatsapp', 'email', 'sms', 'blob', 'push', 'in-app'])
  channel?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'] })
  @IsOptional()
  @IsIn(['true', 'false'])
  success?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity_id?: string;
}

export class QueryClientEventsDto extends Paged {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ enum: ['js_error', 'unhandled_rejection', 'render_error', 'failed_request', 'console_error'] })
  @IsOptional()
  @IsIn(['js_error', 'unhandled_rejection', 'render_error', 'failed_request', 'console_error'])
  kind?: string;
}
