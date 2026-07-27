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
import { SchoolsService } from './schools.service';
import { CreateSchoolDto, CreateSchoolWithContactsDto, UpdateSchoolDto, QuerySchoolDto, SetSchoolCityDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Schools')
@Controller('schools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Post('with-contacts')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create a school with contacts' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'School created with contacts successfully',
  })
  async createWithContacts(
    @Body() dto: CreateSchoolWithContactsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const result = await this.schoolsService.createWithContacts(dto, userId, role);
    return {
      success: true,
      message: 'School created with contacts successfully',
      data: result,
    };
  }

  @Post()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Create a new school' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'School created successfully',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async create(
    @Body() createSchoolDto: CreateSchoolDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const school = await this.schoolsService.create(createSchoolDto, userId, role);
    return {
      success: true,
      message: 'School created successfully',
      data: school,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all schools with pagination and filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Schools retrieved successfully',
  })
  async findAll(@Query() querySchoolDto: QuerySchoolDto) {
    const schools = await this.schoolsService.findAll(querySchoolDto);
    return {
      success: true,
      data: schools.items,
      meta: schools.meta,
      links: schools.links,
    };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get school stats: active deals, open quotes, outstanding invoices' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'School stats retrieved successfully',
  })
  async getStats(@Param('id') id: string) {
    const data = await this.schoolsService.getSchoolStats(id);
    return {
      success: true,
      data,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single school by ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'School retrieved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found',
  })
  async findOne(@Param('id') id: string) {
    const school = await this.schoolsService.findOne(id);
    return {
      success: true,
      message: 'School retrieved successfully',
      data: school,
    };
  }

  @Put(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Update a school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'School updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async update(
    @Param('id') id: string,
    @Body() updateSchoolDto: UpdateSchoolDto,
    @CurrentUser('id') userId: string,
  ) {
    const school = await this.schoolsService.update(
      id,
      updateSchoolDto,
      userId,
    );
    return {
      success: true,
      message: 'School updated successfully',
      data: school,
    };
  }

  @Delete(':id')
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Soft delete a school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'School deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    await this.schoolsService.remove(id, userId);
    return {
      success: true,
      message: 'School deleted successfully',
    };
  }

  @Patch(':id/city')
  @ApiOperation({
    summary: 'Fill in the city on a school that has none (any signed-in user)',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'City saved' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'City already set — only admin/sales_manager may change it',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'School not found' })
  async setCity(
    @Param('id') id: string,
    @Body() dto: SetSchoolCityDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const school = await this.schoolsService.setCity(id, dto.city, userId, role);
    return {
      success: true,
      message: 'City saved',
      data: school,
    };
  }

  @Patch(':id/restore')
  @Roles('admin')
  @ApiOperation({ summary: 'Restore a soft-deleted school' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'School restored successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'School not found or not deleted',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Forbidden' })
  async restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const school = await this.schoolsService.restore(id, userId);
    return {
      success: true,
      message: 'School restored successfully',
      data: school,
    };
  }
}
