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
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QuotesService } from './quotes.service';
import { AuditService } from '../audit/audit.service';
import { CreateQuoteDto, CreateQuoteItemDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QueryQuoteDto } from './dto/query-quote.dto';
import { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CheckPermission } from '../auth/decorators/permissions.decorator';
import { CaslAbility } from '../auth/decorators/casl-ability.decorator';
import type { AppAbility } from '../auth/casl/casl-ability.factory';
import { CanAccessQuoteGuard } from './guards/can-access-quote.guard';
import type { QuoteStatus } from './constants';

@ApiTags('Quotes')
@Controller('quotes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new quote with line items' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Quote created successfully',
  })
  async create(
    @Body() createQuoteDto: CreateQuoteDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: a rep can only raise a quote against their own deal.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const quote = await this.quotesService.create(
      createQuoteDto,
      userId,
      undefined,
      scopeUserId,
    );
    return {
      success: true,
      message: 'Quote created successfully',
      data: quote,
    };
  }

  @Get()
  @CheckPermission('read', 'Quote')
  @ApiOperation({ summary: 'Get all quotes with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quotes retrieved successfully',
  })
  async findAll(
    @Query() query: QueryQuoteDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @CaslAbility() ability: AppAbility,
  ) {
    const result = await this.quotesService.findAll(
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
  @CheckPermission('read', 'Quote')
  @ApiOperation({ summary: 'Quote stats: totals, conversion rate, accepted rate by period' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote stats retrieved successfully',
  })
  async getStats(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: a rep's KPIs cover their own quotes, not the whole company.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const data = await this.quotesService.getQuoteStats(scopeUserId);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  @CheckPermission('read', 'Quote')
  @ApiOperation({ summary: 'Get a single quote with items' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote retrieved successfully',
  })
  async findOne(@Param('id') id: string, @CaslAbility() ability: AppAbility) {
    const quote = await this.quotesService.findOneWithItems(id, ability);
    return {
      success: true,
      data: quote,
    };
  }

  @Get(':id/pdf')
  @CheckPermission('read', 'Quote')
  @ApiOperation({
    summary: 'Download the quote as a PDF, generated on the fly',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'PDF stream' })
  async downloadPdf(
    @Param('id') id: string,
    @CaslAbility() ability: AppAbility,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    // Blob-free download: the PDF is generated in-process (pdfkit) and
    // streamed straight to the browser, so downloads work even when
    // Vercel Blob is not configured (previously the only path stored the
    // PDF in Blob and served its URL — with no token, nothing downloaded).
    const { buffer, fileName } = await this.quotesService.getPdf(id, ability);
    // QDL1: a quote PDF carries pricing — record who pulled it and when.
    // Best-effort; the audit-context middleware fills IP. Never block the
    // download if the audit write fails.
    void this.audit
      .log('Quote', id, 'download', undefined, userId)
      .catch(() => undefined);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(buffer);
  }

  @Put(':id')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update a quote (not items)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Body() updateQuoteDto: UpdateQuoteDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // C-03: the guard covers the quote; the service checks any deal_id
    // change in the body against the caller.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const quote = await this.quotesService.update(
      id,
      updateQuoteDto,
      userId,
      scopeUserId,
    );
    return {
      success: true,
      message: 'Quote updated successfully',
      data: quote,
    };
  }

  @Delete(':id')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete a quote' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote deleted successfully',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.quotesService.remove(id, userId);
    return {
      success: true,
      message: 'Quote deleted successfully',
    };
  }

  @Patch(':id/status')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update quote status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Quote status updated successfully',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: QuoteStatus,
    @CurrentUser('id') userId: string,
  ) {
    const quote = await this.quotesService.updateStatus(id, status, userId);
    return {
      success: true,
      message: 'Quote status updated successfully',
      data: quote,
    };
  }

  // ========================
  // Item Management
  // ========================

  @Post(':id/items')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Add a line item to a quote' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Item added successfully',
  })
  async addItem(
    @Param('id') id: string,
    @Body() dto: CreateQuoteItemDto,
    @CurrentUser('id') userId: string,
  ) {
    const quote = await this.quotesService.addItem(id, dto, userId);
    return {
      success: true,
      message: 'Item added successfully',
      data: quote,
    };
  }

  @Put(':id/items/:itemId')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update a line item in a quote' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Item updated successfully',
  })
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateQuoteItemDto,
    @CurrentUser('id') userId: string,
  ) {
    const quote = await this.quotesService.updateItem(id, itemId, dto, userId);
    return {
      success: true,
      message: 'Item updated successfully',
      data: quote,
    };
  }

  @Delete(':id/items/:itemId')
  @UseGuards(CanAccessQuoteGuard)
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Remove a line item from a quote' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Item removed successfully',
  })
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser('id') userId: string,
  ) {
    const quote = await this.quotesService.removeItem(id, itemId, userId);
    return {
      success: true,
      message: 'Item removed successfully',
      data: quote,
    };
  }
}
