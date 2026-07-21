import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import type { SetSettingDto } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { SkipRolesCheck } from '../auth/decorators/skip-roles-check.decorator';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Public()
  @SkipRolesCheck()
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all settings (key-value pairs)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all application settings as key-value pairs',
  })
  async getSettings(@Query('keys') keys?: string) {
    const keyArray = keys ? keys.split(',') : undefined;
    const settings = await this.settingsService.getSettings(keyArray);
    return {
      success: true,
      data: settings,
    };
  }

  @Public()
  @SkipRolesCheck()
  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all settings with metadata (admin only)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all settings with full metadata',
  })
  async getAllSettings() {
    const settings = await this.settingsService.getAllSettings();
    return {
      success: true,
      data: settings,
    };
  }

  @Public()
  @SkipRolesCheck()
  @Get('public')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get public settings' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns public settings accessible by all users',
  })
  async getPublicSettings() {
    const settings = await this.settingsService.getPublicSettings();
    return {
      success: true,
      data: settings,
    };
  }

  @Get('category/:category')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get settings by category' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns settings for the specified category',
  })
  async getSettingsByCategory(@Param('category') category: string) {
    const settings = await this.settingsService.getSettingsByCategory(category);
    return {
      success: true,
      data: settings,
    };
  }

  @Get(':key')
  @Roles('admin', 'sales_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single setting by key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the setting with the specified key',
  })
  async getSetting(@Param('key') key: string) {
    const setting = await this.settingsService.getSetting(key);
    return {
      success: true,
      data: setting,
    };
  }

  @Post()
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a single setting (create or update)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Setting created or updated successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: { type: 'string', example: 'school_name' },
        value: { example: 'DigiLearn CRM' },
        data_type: {
          type: 'string',
          enum: ['string', 'number', 'boolean', 'json', 'date'],
          example: 'string',
        },
        description: {
          type: 'string',
          example: 'The name of the school',
        },
        category: { type: 'string', example: 'general' },
        is_public: { type: 'boolean', example: true },
      },
      required: ['key', 'value'],
    },
  })
  async setSetting(@Body() dto: SetSettingDto) {
    const setting = await this.settingsService.setSetting(dto);
    return {
      success: true,
      message: 'Setting saved successfully',
      data: setting,
    };
  }

  @Post('bulk')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set multiple settings at once' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Settings created or updated successfully',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        settings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: {},
              data_type: { type: 'string' },
              description: { type: 'string' },
              category: { type: 'string' },
              is_public: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  async setSettings(@Body('settings') settings: SetSettingDto[]) {
    const result = await this.settingsService.setSettings(settings);
    return {
      success: true,
      message: 'Settings saved successfully',
      data: result,
    };
  }

  @Delete(':key')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a setting (soft delete)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Setting deleted successfully',
  })
  async deleteSetting(@Param('key') key: string) {
    const result = await this.settingsService.deleteSetting(key);
    return result;
  }

  @Delete(':key/hard')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Permanently delete a setting' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Setting permanently deleted',
  })
  async hardDeleteSetting(@Param('key') key: string) {
    const result = await this.settingsService.hardDeleteSetting(key);
    return result;
  }

  @Post(':key/restore')
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restore a deleted setting' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Setting restored successfully',
  })
  async restoreSetting(@Param('key') key: string) {
    const setting = await this.settingsService.restoreSetting(key);
    return {
      success: true,
      message: 'Setting restored successfully',
      data: setting,
    };
  }
}
