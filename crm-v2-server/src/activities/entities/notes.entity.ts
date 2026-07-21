// ============================================================================
// NOTES
// ============================================================================

import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { Activity } from "./activity.entity";

@Entity('notes')
@Index('idx_notes_activity', ['activity_id'])
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tags: string; // Comma-separated or JSON

  /**
   * Section 3 of the activity spec: notes are strictly internal. This
   * column always resolves to TRUE — kept as a column (rather than a
   * hard-coded literal) so that a future product decision to expose
   * "public notes" can flip this per-row without a schema change.
   * Until that day arrives, the create DTO forces it to TRUE.
   */
  @Column({ type: 'boolean', default: true })
  is_internal: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @OneToOne(() => Activity, (activity) => activity.note, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;
}