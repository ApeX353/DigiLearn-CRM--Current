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
  Patch,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import {
  CreateInvoiceDto,
  CreateInvoiceItemDto,
} from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { UpdateInvoiceItemDto } from './dto/update-invoice-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { CanAccessInvoiceGuard } from './guards/can-access-invoice.guard';
import type { InvoiceStatus } from './constants';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new invoice with line items' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Invoice created successfully',
  })
  async create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: a rep can only raise an invoice against their own deal/quote.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const invoice = await this.invoicesService.create(dto, userId, scopeUserId);
    return {
      success: true,
      message: 'Invoice created successfully',
      data: invoice,
    };
  }

  @Get()
  @CheckPermission('read', 'Invoice')
  @ApiOperation({
    summary: 'Get all invoices with pagination and filters',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoices retrieved successfully',
  })
  async findAll(
    @Query() query: QueryInvoiceDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const result = await this.invoicesService.findAll(
      query,
      userId,
      userRole,
      ability,
    );
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('stats')
  @CheckPermission('read', 'Invoice')
  @ApiOperation({ summary: 'Invoice stats: totals, collection rate, outstanding by period' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Invoice stats retrieved successfully',
  })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: a rep's KPIs cover their own invoices, not the whole company.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.invoicesService.getInvoiceStats(scopeUserId);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  @CheckPermission('read', 'Invoice')
  @ApiOperation({ summary: 'Get a single invoice with items' })
  async findOne(@Param('id') id: string, @CaslAbility() ability: AppAbility) {
    const invoice = await this.invoicesService.findOneWithItems(id, ability);
    return {
      success: true,
      data: invoice,
    };
  }

  @Get(':id/payment-schedule')
  @CheckPermission('read', 'Invoice')
  @ApiOperation({ summary: 'Get installments and applied payment terms for an invoice' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment schedule retrieved successfully',
  })
  async getPaymentSchedule(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
  ) {
    await this.invoicesService.findOne(id, ability);
    const data = await this.invoicesService.getPaymentSchedule(id);
    return {
      success: true,
      data,
    };
  }

  @Put(':id')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update an invoice (not items)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: the guard covers the invoice; the service checks any
    // deal_id/quote_id change in the body against the caller.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const invoice = await this.invoicesService.update(
      id,
      dto,
      userId,
      scopeUserId,
    );
    return {
      success: true,
      message: 'Invoice updated successfully',
      data: invoice,
    };
  }

  @Delete(':id')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete an invoice' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.invoicesService.remove(id, userId);
    return {
      success: true,
      message: 'Invoice deleted successfully',
    };
  }

  @Patch(':id/status')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update invoice status' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus,
    @CurrentUser('id') userId: string,
  ) {
    const invoice = await this.invoicesService.updateStatus(
      id,
      status,
      userId,
    );
    return {
      success: true,
      message: 'Invoice status updated successfully',
      data: invoice,
    };
  }

  // ========================
  // Quote to Invoice Conversion
  // ========================

  @Post('convert-from-quote/:quoteId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Convert a quote to an invoice' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Invoice created from quote successfully',
  })
  async convertFromQuote(
    @Param('quoteId') quoteId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Body('dealId') dealId?: string,
  ) {
    // C-03: a rep can only convert their own quote.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const invoice = await this.invoicesService.convertFromQuote(
      quoteId,
      userId,
      dealId,
      scopeUserId,
    );
    return {
      success: true,
      message: 'Invoice created from quote successfully',
      data: invoice,
    };
  }

  // ========================
  // Item Management
  // ========================

  @Post(':id/items')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Add a line item to an invoice' })
  async addItem(
    @Param('id') id: string,
    @Body() dto: CreateInvoiceItemDto,
    @CurrentUser('id') userId: string,
  ) {
    const invoice = await this.invoicesService.addItem(id, dto, userId);
    return {
      success: true,
      message: 'Item added successfully',
      data: invoice,
    };
  }

  @Put(':id/items/:itemId')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update a line item in an invoice' })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateInvoiceItemDto,
    @CurrentUser('id') userId: string,
  ) {
    const invoice = await this.invoicesService.updateItem(
      id,
      itemId,
      dto,
      userId,
    );
    return {
      success: true,
      message: 'Item updated successfully',
      data: invoice,
    };
  }

  @Delete(':id/items/:itemId')
  @UseGuards(CanAccessInvoiceGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Remove a line item from an invoice' })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    const invoice = await this.invoicesService.removeItem(
      id,
      itemId,
      userId,
    );
    return {
      success: true,
      message: 'Item removed successfully',
      data: invoice,
    };
  }
}
