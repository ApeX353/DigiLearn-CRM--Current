export interface Setting {
  id: string;
  key: string;
  value: string | number | boolean | object;
  data_type: 'string' | 'number' | 'boolean' | 'json' | 'date';
  description?: string;
  category?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface CreateSettingDto {
  key: string;
  value: string | number | boolean | object;
  data_type?: 'string' | 'number' | 'boolean' | 'json' | 'date';
  description?: string;
  category?: string;
  is_public?: boolean;
}

export interface BulkSettingsDto {
  settings: CreateSettingDto[];
}

export interface SettingsResponse {
  [key: string]: string | number | boolean | object;
}
