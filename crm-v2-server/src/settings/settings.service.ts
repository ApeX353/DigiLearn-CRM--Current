import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Settings, SettingDataType } from './entities/settings.entity';

export interface SetSettingDto {
  key: string;
  value: any;
  data_type?: SettingDataType;
  description?: string;
  category?: string;
  is_public?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private settingsRepository: Repository<Settings>,
  ) {}

  /**
   * Get a single setting by key
   */
  async getSetting(key: string): Promise<Settings | null> {
    return this.settingsRepository.findOne({
      where: { key, is_active: true },
    });
  }

  /**
   * Get multiple settings by keys
   * Returns a map of key => value
   */
  async getSettings(keys?: string[]): Promise<Record<string, any>> {
    let query = this.settingsRepository.createQueryBuilder('settings');
    query.where('settings.is_active = :isActive', { isActive: true });

    if (keys && keys.length > 0) {
      query.andWhere('settings.key IN (:...keys)', { keys });
    }

    const settings = await query.getMany();

    const result: Record<string, any> = {};
    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return result;
  }

  /**
   * Get all settings (admin only)
   */
  async getAllSettings(): Promise<Settings[]> {
    return this.settingsRepository.find({
      where: { is_active: true },
      order: { category: 'ASC', key: 'ASC' },
    });
  }

  /**
   * Get public settings (accessible by all authenticated users)
   */
  async getPublicSettings(): Promise<Record<string, any>> {
    const settings = await this.settingsRepository.find({
      where: { is_active: true, is_public: true },
    });

    const result: Record<string, any> = {};
    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return result;
  }

  /**
   * Get settings by category
   */
  async getSettingsByCategory(category: string): Promise<Record<string, any>> {
    const settings = await this.settingsRepository.find({
      where: { category, is_active: true },
      order: { key: 'ASC' },
    });

    const result: Record<string, any> = {};
    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return result;
  }

  /**
   * Set a single setting (create or update)
   */
  async setSetting(dto: SetSettingDto): Promise<Settings> {
    const existing = await this.settingsRepository.findOne({
      where: { key: dto.key },
    });

    if (existing) {
      // Update existing setting
      existing.value = dto.value;
      if (dto.data_type) existing.data_type = dto.data_type;
      if (dto.description) existing.description = dto.description;
      if (dto.category) existing.category = dto.category;
      if (dto.is_public !== undefined) existing.is_public = dto.is_public;

      return this.settingsRepository.save(existing);
    } else {
      // Create new setting
      const newSetting = this.settingsRepository.create({
        key: dto.key,
        value: dto.value,
        data_type: dto.data_type || this.inferDataType(dto.value),
        description: dto.description || null,
        category: dto.category || null,
        is_public: dto.is_public || false,
        is_active: true,
      });

      return this.settingsRepository.save(newSetting);
    }
  }

  /**
   * Set multiple settings at once
   */
  async setSettings(settings: SetSettingDto[]): Promise<Settings[]> {
    const results: Settings[] = [];

    for (const dto of settings) {
      const setting = await this.setSetting(dto);
      results.push(setting);
    }

    return results;
  }

  /**
   * Delete a setting by key (soft delete by setting is_active to false)
   */
  async deleteSetting(key: string): Promise<{ success: boolean; message: string }> {
    const setting = await this.settingsRepository.findOne({ where: { key } });

    if (!setting) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    setting.is_active = false;
    await this.settingsRepository.save(setting);

    return {
      success: true,
      message: `Setting "${key}" deleted successfully`,
    };
  }

  /**
   * Hard delete a setting
   */
  async hardDeleteSetting(key: string): Promise<{ success: boolean; message: string }> {
    const result = await this.settingsRepository.delete({ key });

    if (result.affected === 0) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    return {
      success: true,
      message: `Setting "${key}" permanently deleted`,
    };
  }

  /**
   * Restore a deleted setting
   */
  async restoreSetting(key: string): Promise<Settings> {
    const setting = await this.settingsRepository.findOne({
      where: { key, is_active: false },
    });

    if (!setting) {
      throw new NotFoundException(
        `Inactive setting with key "${key}" not found`,
      );
    }

    setting.is_active = true;
    return this.settingsRepository.save(setting);
  }

  /**
   * Infer data type from value
   */
  private inferDataType(value: any): SettingDataType {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'json';
  }
}
