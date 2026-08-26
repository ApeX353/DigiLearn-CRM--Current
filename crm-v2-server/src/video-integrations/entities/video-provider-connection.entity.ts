import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * The set of video providers we can auto-generate join links for. The
 * scheduling module keeps its own enum (SchedulingLinkLocation) that
 * adds a "custom" / "in_person" / "phone" bucket; this list is
 * intentionally the strict subset that requires OAuth + API access.
 */
export enum VideoProvider {
  ZOOM = 'zoom',
  GOOGLE_MEET = 'google_meet',
  TEAMS = 'teams',
}

/**
 * Per-user token blob for a video conferencing provider.  Kept separate
 * from UserCalendarConnection because a user may connect Zoom without
 * connecting Google Calendar (and vice versa), and the scope set is
 * completely different.
 *
 * Tokens live in `encrypted_token_payload` under the same AES-256-GCM
 * envelope the rest of the app uses.
 */
@Entity('video_provider_connections')
@Index('uq_video_provider_connection', ['user_id', 'provider'], { unique: true })
export class VideoProviderConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: VideoProvider })
  provider: VideoProvider;

  /** Provider-side user identity — Zoom returns `id`, Google returns email. */
  @Column({ type: 'varchar', length: 320 })
  provider_account_id: string;

  @Column({ type: 'text' })
  encrypted_token_payload: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
