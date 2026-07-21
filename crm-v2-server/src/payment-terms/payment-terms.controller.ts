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
import { PaymentTermsService } from './payment-terms.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';
import { UpdatePaymentTermDto } from './dto/update-payment-term.dto';
import { QueryPaymentTermDto } from './dto/query-payment-term.dto';
import { ApplyPaymentTermDto } from './dto/apply-payment-term.dto';
import { CalculateInstallmentsDto } from './dto/calculate-installments.dto';
import { QueryInstallmentDto } from './dto/query-installment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Payment Terms')
@Controller('payment-terms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentTermsController {
  constructor(private readonly paymentTermsService: PaymentTermsService) {}

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create a payment term configuration' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment term created successfully',
  })
  async create(
    @Body() dto: CreatePaymentTermDto,
    @CurrentUser('id') userId: string,
  ) {
    const term = await this.paymentTermsService.create(dto, userId);
    return {
      success: true,
      message: 'Payment term created successfully',
      data: term,
    };
  }

  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'List payment terms with pagination' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Payment terms retrieved successfully',
  })
  async findAll(@Query() query: QueryPaymentTermDto) {
    const result = await this.paymentTermsService.findAll(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('installments')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'List installments with pagination and filters' })
  async findAllInstallments(@Query() query: QueryInstallmentDto) {
    const result = await this.paymentTermsService.findAllInstallments(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('schedule/:documentId')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Get installment schedule for a document (invoice/quote)',
  })
  async getSchedule(@Param('documentId') documentId: string) {
    const schedule =
      await this.paymentTermsService.getInstallmentSchedule(documentId);
    return {
      success: true,
      data: schedule,
    };
  }

  @Get(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Get a single payment term with periods' })
  async findOne(@Param('id') id: string) {
    const term = await this.paymentTermsService.findOne(id);
    return {
      success: true,
      data: term,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update a payment term configuration' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentTermDto,
    @CurrentUser('id') userId: string,
  ) {
    const term = await this.paymentTermsService.update(id, dto, userId);
    return {
      success: true,
      message: 'Payment term updated successfully',
      data: term,
    };
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a payment term configuration' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.paymentTermsService.remove(id, userId);
    return {
      success: true,
      message: 'Payment term deleted successfully',
    };
  }

  @Post('apply')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Apply a payment term to an invoice or quote' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Payment term applied successfully',
  })
  async apply(
    @Body() dto: ApplyPaymentTermDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.paymentTermsService.applyToDocument(
      dto,
      userId,
    );
    return {
      success: true,
      message: 'Payment term applied successfully',
      data: result,
    };
  }

  @Post('calculate')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Calculate installment preview without persisting data' })
  async calculate(@Body() dto: CalculateInstallmentsDto) {
    const result = await this.paymentTermsService.calculateInstallments(dto);
    return {
      success: true,
      data: result,
    };
  }

  @Post('allocate/:paymentId')
  @Roles('admin', 'sales_manager')
  @ApiOperation({
    summary: 'FIFO allocate a payment to installments',
  })
  async allocate(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.paymentTermsService.allocatePaymentFIFO(
      paymentId,
      userId,
    );
    return {
      success: true,
      message: 'Payment allocated successfully',
      data: result,
    };
  }
}
