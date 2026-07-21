import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportExportService, type DateRange } from './report-export.service';
import {
  ReportsReadService,
  type SalesPerformancePeriod,
} from './reports-read.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportExportService: ReportExportService,
    private readonly reportsReadService: ReportsReadService,
  ) {}

  // ========================================================================
  // In-app read endpoints — consumed by the Reports page tabs.
  // Shapes match `client/src/api/reports/types.ts` so the frontend hooks
  // read the response body directly with no remapping layer.
  // ========================================================================

  @Get('sales-performance')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Sales performance KPIs for the chosen period' })
  @ApiQuery({ name: 'period', enum: ['month', 'quarter', 'year'], required: false })
  async getSalesPerformance(@Query('period') period?: string) {
    const resolved: SalesPerformancePeriod =
      period === 'month' || period === 'year' ? period : 'quarter';
    return this.reportsReadService.getSalesPerformance(resolved);
  }

  @Get('pipeline-analysis')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Per-stage deal count, value and aging' })
  async getPipelineAnalysis() {
    return this.reportsReadService.getPipelineAnalysis();
  }

  @Get('finance')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'Finance overview — revenue by method, outstanding, upcoming',
  })
  async getFinanceReport() {
    return this.reportsReadService.getFinanceReport();
  }

  @Get('export/sales')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Export sales performance report' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'xlsx'], required: true })
  @ApiQuery({ name: 'dateRange', enum: ['mtd', 'qtd', 'ytd'], required: false })
  async exportSalesReport(
    @Query('format') format: string,
    @Query('dateRange') dateRange: string,
    @Res() res: Response,
  ) {
    this.validateFormat(format);
    const buffer = await this.reportExportService.generateSalesReport(
      format as 'pdf' | 'xlsx',
      (dateRange as DateRange) || 'mtd',
    );

    const filename = `sales-report-${Date.now()}`;
    this.setResponseHeaders(res, format, filename);
    res.send(buffer);
  }

  @Get('export/pipeline')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Export pipeline report' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'xlsx'], required: true })
  async exportPipelineReport(
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    this.validateFormat(format);
    const buffer = await this.reportExportService.generatePipelineReport(
      format as 'pdf' | 'xlsx',
    );

    const filename = `pipeline-report-${Date.now()}`;
    this.setResponseHeaders(res, format, filename);
    res.send(buffer);
  }

  @Get('export/collections')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Export collections aging report' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'xlsx'], required: true })
  @ApiQuery({ name: 'as_of_date', required: false, description: 'YYYY-MM-DD' })
  async exportCollectionsReport(
    @Query('format') format: string,
    @Query('as_of_date') asOfDate: string,
    @Res() res: Response,
  ) {
    this.validateFormat(format);
    const buffer = await this.reportExportService.generateCollectionsReport(
      format as 'pdf' | 'xlsx',
      asOfDate,
    );

    const filename = `collections-aging-${Date.now()}`;
    this.setResponseHeaders(res, format, filename);
    res.send(buffer);
  }

  private validateFormat(format: string) {
    if (!['pdf', 'xlsx'].includes(format)) {
      throw new BadRequestException('Format must be "pdf" or "xlsx"');
    }
  }

  private setResponseHeaders(res: Response, format: string, filename: string) {
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.pdf"`,
      );
    } else {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}.xlsx"`,
      );
    }
  }
}
