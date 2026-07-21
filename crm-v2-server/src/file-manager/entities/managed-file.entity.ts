import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import {
  STORAGE_PROVIDERS,
  type StorageProvider,
  FILE_ENTITY_TYPES,
  type FileEntityType,
} from '../constants/providers';

@Entity('managed_files')
@Index(['entity_type', 'entity_id'])
@Index(['uploaded_by_id'])
export class ManagedFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 500 })
  file_url: string;

  @Column({ type: 'enum', enum: STORAGE_PROVIDERS })
  provider: StorageProvider;

  @Column({ type: 'varchar', length: 100, nullable: true })
  file_type: string | null;

  @Column({ type: 'int', nullable: true, comment: 'File size in bytes' })
  file_size: number | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  // ===== POLYMORPHIC ENTITY REFERENCE =====

  @Column({ type: 'enum', enum: FILE_ENTITY_TYPES })
  entity_type: FileEntityType;

  @Column({ type: 'varchar', length: 36 })
  entity_id: string;

  // ===== OWNERSHIP =====

  @Column({ type: 'uuid' })
  uploaded_by_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploaded_by: User;

  // ===== TIMESTAMPS =====

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
