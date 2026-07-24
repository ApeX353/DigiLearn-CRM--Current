import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Record a payment for an invoice' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment recorded successfully',
  })
  async create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const payment = await this.paymentsService.create(dto, userId);
    return {
      success: true,
      message: 'Payment recorded successfully',
      data: payment,
    };
  }

  // `manager` is seeded with read access to Payment but was missing from
  // every @Roles() gate here, so the role 403'd on the whole module.
  // Reads only — create/update/delete stay closed to it.
  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep', 'manager')
  @ApiOperation({ summary: 'Get all payments with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payments retrieved successfully',
  })
  async findAll(
    @Query() query: QueryPaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // Sales reps only see payments on invoices they own; elevated roles
    // (admin/admin_support/sales_manager/manager) see everything.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const result = await this.paymentsService.findAll(query, scopeUserId);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('stats')
  @Roles('admin', 'sales_manager', 'sales_rep', 'manager')
  @ApiOperation({ summary: 'Payment stats: totals, collections, by method per period' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment stats retrieved successfully',
  })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.paymentsService.getPaymentStats(scopeUserId);
    return {
      success: true,
      data,
    };
  }

  @Get('statistics')
  @Roles('admin', 'sales_manager', 'sales_rep', 'manager')
  @ApiOperation({
    summary: 'Payment statistics for the fiscal-year date range',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment statistics retrieved successfully',
  })
  getStatistics(
    @Query() query: QueryPaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    return this.paymentsService.getPaymentStatistics(query, scopeUserId);
  }

  @Get(':id')
  @Roles('admin', 'sales_manager', 'sales_rep', 'manager')
  @ApiOperation({ summary: 'Get a single payment' })
  async findOne(@Param('id') id: string) {
    const payment = await this.paymentsService.findOne(id);
    return {
      success: true,
      data: payment,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update a payment' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    const payment = await this.paymentsService.update(id, dto, userId);
    return {
      success: true,
      message: 'Payment updated successfully',
      data: payment,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete a payment' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.paymentsService.remove(id, userId);
    return {
      success: true,
      message: 'Payment deleted successfully',
    };
  }
}
