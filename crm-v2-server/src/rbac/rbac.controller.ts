import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import {
  AssignPermissionsDto,
  UnassignPermissionsDto,
} from './dto/assign-permissions.dto';
import { UpdateRolePermissionConditionsDto } from './dto/update-role-permission-conditions.dto';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  @Roles('admin')
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all active permissions',
  })
  async getAllPermissions() {
    const permissions = await this.rbacService.getAllPermissions();
    return {
      success: true,
      data: permissions,
      count: permissions.length,
    };
  }

  @Get('permissions/role/:roleId')
  @Roles('admin')
  @ApiOperation({ summary: 'Get permissions by role ID' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns permissions for the specified role',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  async getPermissionsByRole(@Param('roleId') roleId: string) {
    const permissions = await this.rbacService.getPermissionsByRole(roleId);
    return {
      success: true,
      data: permissions,
      count: permissions.length,
    };
  }

  @Get('permissions/role')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get permissions by role name' })
  @ApiQuery({ name: 'name', description: 'Role name', required: true })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns permissions for the specified role name',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  async getPermissionsByRoleName(@Query('name') roleName: string) {
    const permissions =
      await this.rbacService.getPermissionsByRoleName(roleName);
    return {
      success: true,
      data: permissions,
      count: permissions.length,
    };
  }

  @Get('permissions/user/:userId')
  @ApiOperation({ summary: 'Get permissions for a user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Returns all permissions for the specified user based on their roles',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'User not found',
  })
  async getPermissionsForUser(
    @Param('userId') userId: string,
    @CurrentUser('id') callerId: string,
    @CurrentUser('role') role: string,
  ) {
    // Anyone may read their OWN permission set — the app shell fetches
    // it at login. Reading another user's requires an admin-level role.
    // This is a hand-rolled check (no @Roles), so admin_support is
    // listed explicitly rather than relying on the guard's alias map.
    if (
      userId !== callerId &&
      !['admin', 'super_admin', 'admin_support'].includes(role)
    ) {
      throw new ForbiddenException(
        'You can only read your own permissions',
      );
    }
    const result = await this.rbacService.getPermissionsForUser(userId);
    return {
      success: true,
      data: {
        user_id: userId,
        roles: result.roles,
        permissions: result.permissions,
      },
      roles_count: result.roles.length,
      permissions_count: result.permissions.length,
    };
  }

  @Get('roles')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all active roles with their permissions',
  })
  async getAllRoles() {
    const roles = await this.rbacService.getAllRoles();
    return {
      success: true,
      data: roles,
      count: roles.length,
    };
  }

  @Get('roles/:roleId')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Get role by ID' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the specified role with its permissions',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  async getRoleById(@Param('roleId') roleId: string) {
    const role = await this.rbacService.getRoleById(roleId);
    return {
      success: true,
      data: role,
    };
  }

  @Post('roles')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new role' })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Role created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Role with same name already exists',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    const role = await this.rbacService.createRole(createRoleDto);
    return {
      success: true,
      message: 'Role created successfully',
      data: role,
    };
  }

  @Patch('roles/:roleId')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a role' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Role with same name already exists',
  })
  async updateRole(
    @Param('roleId') roleId: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    const role = await this.rbacService.updateRole(roleId, updateRoleDto);
    return {
      success: true,
      message: 'Role updated successfully',
      data: role,
    };
  }

  @Delete('roles/:roleId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a role (soft delete)' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  async deleteRole(@Param('roleId') roleId: string) {
    await this.rbacService.deleteRole(roleId);
    return {
      success: true,
      message: 'Role deleted successfully',
    };
  }

  @Post('permissions')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new permission' })
  @ApiBody({ type: CreatePermissionDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Permission created successfully',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Permission with same action and subject already exists',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    const permission =
      await this.rbacService.createPermission(createPermissionDto);
    return {
      success: true,
      message: 'Permission created successfully',
      data: permission,
    };
  }

  @Patch('permissions/:permissionId')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a permission' })
  @ApiParam({ name: 'permissionId', description: 'Permission UUID' })
  @ApiBody({ type: UpdatePermissionDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Permission with same action and subject already exists',
  })
  async updatePermission(
    @Param('permissionId') permissionId: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    const permission = await this.rbacService.updatePermission(
      permissionId,
      updatePermissionDto,
    );
    return {
      success: true,
      message: 'Permission updated successfully',
      data: permission,
    };
  }

  @Delete('permissions/:permissionId')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a permission (soft delete)' })
  @ApiParam({ name: 'permissionId', description: 'Permission UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permission deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Permission not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async deletePermission(@Param('permissionId') permissionId: string) {
    await this.rbacService.deletePermission(permissionId);
    return {
      success: true,
      message: 'Permission deleted successfully',
    };
  }

  @Post('roles/:roleId/permissions/assign')
  @Roles('admin')
  @ApiOperation({ summary: 'Assign permissions to a role' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiBody({ type: AssignPermissionsDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permissions assigned successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid permissions or already assigned',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async assignPermissionsToRole(
    @Param('roleId') roleId: string,
    @Body() assignPermissionsDto: AssignPermissionsDto,
  ) {
    const rolePermissions = await this.rbacService.assignPermissionsToRole(
      roleId,
      assignPermissionsDto.permissions,
    );
    return {
      success: true,
      message: 'Permissions assigned successfully',
      data: rolePermissions,
    };
  }

  @Post('roles/:roleId/permissions/unassign')
  @Roles('admin')
  @ApiOperation({ summary: 'Remove permissions from a role' })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiBody({ type: UnassignPermissionsDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Permissions removed successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Permissions not assigned to this role',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async unassignPermissionsFromRole(
    @Param('roleId') roleId: string,
    @Body() unassignPermissionsDto: UnassignPermissionsDto,
  ) {
    await this.rbacService.unassignPermissionsFromRole(
      roleId,
      unassignPermissionsDto.permission_ids,
    );
    return {
      success: true,
      message: 'Permissions removed successfully',
    };
  }

  @Patch('roles/:roleId/permissions/:permissionId')
  @Roles('admin')
  @ApiOperation({
    summary: 'Update role-specific conditions for a permission',
  })
  @ApiParam({ name: 'roleId', description: 'Role UUID' })
  @ApiParam({ name: 'permissionId', description: 'Permission UUID' })
  @ApiBody({ type: UpdateRolePermissionConditionsDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Role-permission conditions updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Role-permission assignment not found',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized - JWT token required',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Forbidden - Admin role required',
  })
  async updateRolePermissionConditions(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
    @Body() updateDto: UpdateRolePermissionConditionsDto,
  ) {
    const rolePermission =
      await this.rbacService.updateRolePermissionConditions(
        roleId,
        permissionId,
        updateDto.conditions,
      );
    return {
      success: true,
      message: 'Role-permission conditions updated successfully',
      data: rolePermission,
    };
  }
}
