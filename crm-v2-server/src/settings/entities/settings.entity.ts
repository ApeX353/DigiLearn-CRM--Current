import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export const SETTING_DATA_TYPES = [
  'string',
  'number',
  'boolean',
  'json',
  'date',
] as const;

export type SettingDataType = (typeof SETTING_DATA_TYPES)[number];

@Entity('app_settings')
@Index(['key'], { unique: true })
export class Settings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'json' })
  value: any;

  @Column({ type: 'varchar', length: 20, default: 'string' })
  data_type: SettingDataType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;

  @Column({ default: false, comment: 'Can be accessed by non-admin users' })
  is_public: boolean;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
