import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Equals, IsDateString } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ContentUploadLimitInterceptor } from '../file-manager/content-upload-limit.interceptor';
import {
  BugReportsService,
  TRIAGE_ROLES,
  type RequestingUser,
} from './bug-reports.service';
import { BugScreenshotsService } from './bug-screenshots.service';
import { CreateBugReportDto } from './dto/bug-report.dto';
import {
  MAX_SCREENSHOT_BYTES,
  type ScreenshotUpload,
} from './screenshot-policy';

class ConfirmScreenshotDeletionDto {
  @Equals(true) confirm: boolean;
  @IsDateString() expectedDueAt: string;
}
const operators = [
  'admin',
  'admin_support',
  'manager',
  'sales_manager',
  'sales_rep',
  'finance',
];

@Controller('bug-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BugScreenshotsController {
  constructor(
    private readonly bugs: BugReportsService,
    private readonly screenshots: BugScreenshotsService,
  ) {}

  @Post('with-screenshots')
  @Roles(...operators)
  @UseInterceptors(
    ContentUploadLimitInterceptor,
    FilesInterceptor('screenshots', 3, {
      limits: {
        fileSize: MAX_SCREENSHOT_BYTES + 1,
        files: 3,
        fields: 1,
        parts: 5,
        fieldSize: 100000,
      },
    }),
  )
  async create(
    @Body('report') raw: string,
    @UploadedFiles() files: ScreenshotUpload[],
    @CurrentUser('id') userId: string,
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException('Invalid report details');
    }
    const dto = await new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }).transform(parsed, { type: 'body', metatype: CreateBugReportDto });
    const data = await this.bugs.create(dto, userId, files || []);
    return { success: true, data };
  }

  @Get(':id/screenshots')
  @Roles(...operators)
  async list(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestingUser,
  ) {
    return { success: true, data: await this.screenshots.list(id, user) };
  }

  @Get(':id/screenshots/:screenshotId/content')
  @Roles(...operators)
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('screenshotId', ParseUUIDPipe) screenshotId: string,
    @CurrentUser() user: RequestingUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.screenshots.content(id, screenshotId, user);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.content, {
      type: file.file_type,
      length: file.content.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16))}`,
    });
  }

  @Post(':id/screenshots/:screenshotId/approve-deletion')
  @Roles(...TRIAGE_ROLES)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('screenshotId', ParseUUIDPipe) screenshotId: string,
    @Body() dto: ConfirmScreenshotDeletionDto,
    @CurrentUser() user: RequestingUser,
  ) {
    return {
      success: true,
      data: await this.screenshots.approveDeletion(
        id,
        screenshotId,
        user,
        dto.expectedDueAt,
      ),
    };
  }
}
