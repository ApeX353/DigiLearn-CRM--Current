import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto, QueryContactDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Contact created successfully' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async create(
    @Body() createContactDto: CreateContactDto,
    @CurrentUser('id') userId: string,
  ) {
    const contact = await this.contactsService.create(createContactDto, userId);
    return {
      success: true,
      message: 'Contact created successfully',
      data: contact,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all contacts with pagination and filters' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contacts retrieved successfully' })
  async findAll(@Query() queryContactDto: QueryContactDto) {
    const contacts = await this.contactsService.findAll(queryContactDto);
    return {
      success: true,
      message: 'Contacts retrieved successfully',
      data: contacts,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single contact by ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contact retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contact not found' })
  async findOne(@Param('id') id: string) {
    const contact = await this.contactsService.findOne(id);
    return {
      success: true,
      message: 'Contact retrieved successfully',
      data: contact,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Update a contact' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contact updated successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contact not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @CurrentUser('id') userId: string,
  ) {
    const contact = await this.contactsService.update(id, updateContactDto, userId);
    return {
      success: true,
      message: 'Contact updated successfully',
      data: contact,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Soft delete a contact' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contact deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contact not found' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.contactsService.remove(id, userId);
    return {
      success: true,
      message: 'Contact deleted successfully',
    };
  }

  @Patch(':id/restore')
  @Roles('admin')
  @ApiOperation({ summary: 'Restore a soft-deleted contact' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Contact restored successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Contact not found or not deleted' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async restore(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    const contact = await this.contactsService.restore(id, userId);
    return {
      success: true,
      message: 'Contact restored successfully',
      data: contact,
    };
  }
}
