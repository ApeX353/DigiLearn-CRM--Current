import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsReadService } from './reports-read.service';

/**
 * `/collections/aging-report` lives here (inside the reports module)
 * instead of in its own module because its data source — the
 * Installment repository — is already wired up for the Finance
 * report. Splitting it out would duplicate the repository injection
 * and the query logic for no benefit.
 */
@ApiTags('Collections')
@ApiBearerAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly reportsReadService: ReportsReadService) {}

  @Get('aging-report')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary:
      'Installments grouped by aging bucket with per-customer balances',
  })
  @ApiQuery({
    name: 'as_of_date',
    required: false,
    description: 'YYYY-MM-DD. Defaults to today.',
  })
  async getAgingReport(@Query('as_of_date') asOfDate?: string) {
    return this.reportsReadService.getAgingReport(asOfDate);
  }
}
