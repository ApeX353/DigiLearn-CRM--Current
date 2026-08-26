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
 * Re-usable email template saved by a user, with merge variables
 * evaluated server-side before sending. Spec Section 3 (unified
 * email communication) calls out templates + mail merge as core.
 *
 * Scope:
 *   - `owner_user_id` is set → the template is personal; only that
 *     user can pick it in the composer.
 *   - `owner_user_id` is null → the template is organisation-wide;
 *     any rep can use it. Only admins can create org-wide templates.
 */
@Entity('email_templates')
@Index('idx_email_template_owner', ['owner_user_id'])
@Index('idx_email_template_slug', ['slug'])
export class EmailTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for organisation-wide templates. */
  @Column({ type: 'uuid', nullable: true })
  owner_user_id: string | null;

  /** Short human-friendly identifier, e.g. "demo-followup-v2". */
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  /** Display name shown in the picker. */
  @Column({ type: 'varchar', length: 200 })
  name: string;

  /**
   * Subject line. Mustache syntax is supported — `{{lead.lead_name}}`
   * is substituted at render time from the merge-var context.
   */
  @Column({ type: 'varchar', length: 500 })
  subject: string;

  /** HTML body. Mustache compatible. */
  @Column({ type: 'text' })
  body_html: string;

  /**
   * Optional plain-text fallback for email clients that block HTML.
   * If null the server derives one by stripping tags.
   */
  @Column({ type: 'text', nullable: true })
  body_text: string | null;

  /**
   * JSON list describing the merge variables the author references in
   * the template — lets the composer UI show a "variables used" hint
   * so the user can verify data is available before sending.
   * Shape: [{ key: "lead.lead_name", label: "Lead name", required: true }]
   */
  @Column({ type: 'json', nullable: true })
  variables: Array<{
    key: string;
    label?: string;
    required?: boolean;
  }> | null;

  /**
   * Category surface used in the picker (e.g. "follow-up", "quote",
   * "invoice"). Optional — null lands the template under "General".
   */
  @Column({ type: 'varchar', length: 60, nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'owner_user_id' })
  owner: User | null;
}
