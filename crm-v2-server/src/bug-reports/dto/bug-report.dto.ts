import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  MaxLength,
  MinLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BugSeverity,
  BugStatus,
  WorkType,
  WorkPriority,
} from '../entities/bug-report.entity';

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

  /** What kind of work this is; defaults to `bug` server-side if omitted. */
  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  component?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  labels?: string[];

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
  @IsEnum(WorkType)
  workType?: WorkType;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  component?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  labels?: string[];

  /** Mark this ticket a duplicate of another; null clears the link. */
  @IsOptional()
  @IsUUID('4')
  duplicateOfId?: string | null;

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
  @IsEnum(WorkType)
  workType?: WorkType;

  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  component?: string;

  /**
   * Assignee filter. A UUID narrows to that person; the literal string
   * `unassigned` returns only tickets with no assignee.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignee?: string;

  /** Full-text search across title + description. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

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
