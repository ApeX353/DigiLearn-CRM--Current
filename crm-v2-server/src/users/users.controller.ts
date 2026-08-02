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
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-users.dto';
import { UpdateUserDto } from './dto/update-users.dto';
import { QueryUserDto } from './dto/query-users.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Users Management')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly staffService: UsersService) {}

  @Get()
  @Roles('admin', 'sales_manager')
  @ApiOperation({ summary: 'Get all staff members with pagination' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filter by role name',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'all'],
    example: 'active',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns paginated list of staff members',
  })
  async findAll(@Query() query: QueryUserDto) {
    const result = await this.staffService.findAll(query);
    return {
      success: true,
      data: result.items,
      meta: result.meta,
      links: result.links,
    };
  }

  @Get('stats')
  @Roles('admin')
  @ApiOperation({ summary: 'Get staff statistics' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns staff statistics',
  })
  async getStats() {
    const stats = await this.staffService.getStats();
    return {
      success: true,
      data: stats,
    };
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get a staff member by ID' })
  @ApiParam({ name: 'id', description: 'User member UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the staff member details',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User member not found',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const staff = await this.staffService.findOne(id);
    return {
      success: true,
      data: staff,
    };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new staff member' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User member created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async create(@Body() createUserDto: CreateUserDto) {
    const staff = await this.staffService.create(createUserDto);
    return {
      success: true,
      message: 'User member created successfully',
      data: staff,
    };
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a staff member' })
  @ApiParam({ name: 'id', description: 'User member UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User member updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User member not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const staff = await this.staffService.update(id, updateUserDto);
    return {
      success: true,
      message: 'User member updated successfully',
      data: staff,
    };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a staff member (soft delete)' })
  @ApiParam({ name: 'id', description: 'User member UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User member deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User member not found',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.staffService.remove(id);
    return {
      success: true,
      message: 'User member deleted successfully',
    };
  }

  @Patch(':id/activate')
  @Roles('admin')
  @ApiOperation({ summary: 'Activate a staff member' })
  @ApiParam({ name: 'id', description: 'User member UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'User member activated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User member not found',
  })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    const staff = await this.staffService.activate(id);
    return {
      success: true,
      message: 'User member activated successfully',
      data: staff,
    };
  }
}
