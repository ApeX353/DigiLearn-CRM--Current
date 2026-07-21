import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('auth_sessions')
@Index(['user_id', 'is_active'])
@Index(['refresh_token_hash'], { unique: true })
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  user_id: string;

  @Column({ type: 'varchar', length: 255 })
  refresh_token_hash: string; // Hashed refresh token

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ default: true })
  is_active: boolean;

  // Session metadata
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  device_type: string; // 'mobile', 'desktop', 'tablet'

  @Column({ type: 'varchar', length: 100, nullable: true })
  browser: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  os: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  country: string; // ISO country code

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  // Last activity tracking
  @Column({ type: 'timestamp', nullable: true })
  last_activity_at: Date;

  // Revocation
  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date;

  @Column({ type: 'text', nullable: true })
  revoke_reason: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
