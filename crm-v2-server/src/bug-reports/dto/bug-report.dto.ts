import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BugSeverity, BugStatus } from '../entities/bug-report.entity';

export class CreateBugReportDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  description: string;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}

export class UpdateBugReportDto {
  @IsOptional()
  @IsEnum(BugStatus)
  status?: BugStatus;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  /** UUID of the user to assign to, or null to unassign. */
  @IsOptional()
  @IsUUID('4')
  assignedToId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;

  /**
   * Triagers may reword a ticket. The owner and the sales managers read
   * these, so a report written in developer shorthand can be rewritten in
   * plain words without losing the ticket, its history or its code.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;
}

export class QueryBugReportDto {
  @IsOptional()
  @IsEnum(BugStatus)
  status?: BugStatus;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
