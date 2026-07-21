import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmailTemplatesService } from './services/email-templates.service';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto';

interface CurrentUserPayload {
  id: string;
  role?: string;
  roles?: string[];
}

function isAdmin(user: CurrentUserPayload | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.roles?.includes('admin');
}

@ApiTags('Email Templates')
@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailTemplatesController {
  constructor(private readonly templatesService: EmailTemplatesService) {}

  @Get()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'List email templates visible to the current user',
    description:
      'Returns the caller\'s private templates plus every organisation-wide template.',
  })
  async list(@CurrentUser('id') userId: string) {
    const data = await this.templatesService.listForUser(userId);
    return { success: true, data };
  }

  @Get(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.templatesService.findOne(id, userId);
    return { success: true, data };
  }

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new email template' })
  async create(
    @Body() dto: CreateEmailTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const data = await this.templatesService.create(dto, user.id, isAdmin(user));
    return {
      success: true,
      message: 'Email template created successfully',
      data,
    };
  }

  @Patch(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const data = await this.templatesService.update(
      id,
      dto,
      user.id,
      isAdmin(user),
    );
    return {
      success: true,
      message: 'Email template updated successfully',
      data,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiResponse({ status: HttpStatus.OK, description: 'Deleted successfully' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.templatesService.remove(id, user.id, isAdmin(user));
    return { success: true, message: 'Email template deleted successfully' };
  }

  /**
   * Server-side render preview. Lets the composer show "what will this
   * look like when I hit send?" without having to re-implement Mustache
   * in the browser. Callers pass the relevant entity IDs as query
   * params so GET stays cacheable / CORS-friendly.
   */
  @Get(':id/render')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Preview a template with merged variables',
  })
  @ApiParam({ name: 'id', description: 'Template UUID' })
  async render(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Query('lead_id') leadId?: string,
    @Query('deal_id') dealId?: string,
    @Query('contact_id') contactId?: string,
  ) {
    const data = await this.templatesService.render(id, userId, {
      senderUserId: userId,
      leadId,
      dealId,
      contactId,
    });
    return { success: true, data };
  }
}
