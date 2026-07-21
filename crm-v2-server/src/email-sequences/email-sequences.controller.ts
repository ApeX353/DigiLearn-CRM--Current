import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { EmailSequenceService } from './email-sequence.service';
import { CreateEmailSequenceDto } from './dto/create-email-sequence.dto';
import { UpdateEmailSequenceDto } from './dto/update-email-sequence.dto';

@ApiTags('Email Sequences')
@ApiBearerAuth()
@Controller('email-sequences')
export class EmailSequencesController {
  constructor(
    private readonly emailSequenceService: EmailSequenceService,
  ) {}

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create an email sequence' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Sequence created' })
  async create(@Body() dto: CreateEmailSequenceDto) {
    const sequence = await this.emailSequenceService.create(dto);
    return { success: true, data: sequence };
  }

  @Get()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'List all email sequences' })
  async findAll() {
    const sequences = await this.emailSequenceService.findAll();
    return { success: true, data: sequences };
  }

  @Get('queue')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'View email queue items' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'sent', 'failed', 'cancelled'] })
  async getQueue(@Query('status') status?: string) {
    const items = await this.emailSequenceService.getQueueItems(status);
    return { success: true, data: items };
  }

  @Get(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Get an email sequence' })
  @ApiParam({ name: 'id', description: 'Sequence UUID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const sequence = await this.emailSequenceService.findOne(id);
    return { success: true, data: sequence };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update an email sequence' })
  @ApiParam({ name: 'id', description: 'Sequence UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailSequenceDto,
  ) {
    const sequence = await this.emailSequenceService.update(id, dto);
    return { success: true, data: sequence };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Delete an email sequence' })
  @ApiParam({ name: 'id', description: 'Sequence UUID' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.emailSequenceService.remove(id);
    return { success: true, message: 'Sequence deleted' };
  }
}
