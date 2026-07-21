import { Entity, Index, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { Activity } from "./activity.entity";

export enum MeetingPlatform {
  ZOOM = 'zoom',
  TEAMS = 'teams',
  GOOGLE_MEET = 'google_meet',
  IN_PERSON = 'in_person',
  PHONE = 'phone',
  OTHER = 'other',
}

@Entity('meetings')
@Index('idx_meetings_activity', ['activity_id'])
@Index('idx_meetings_start_time', ['start_time'])
@Index('idx_meetings_platform', ['platform'])
export class Meeting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  activity_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({
    type: 'enum',
    enum: MeetingPlatform,
  })
  platform: MeetingPlatform;

  // Meeting details
  @Column({ type: 'timestamp' })
  start_time: Date;

  @Column({ type: 'timestamp' })
  end_time: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string; // Physical or virtual

  @Column({ type: 'text', nullable: true })
  meeting_link: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  dial_in_number: string;

  // Participants (JSON array)
  @Column({ type: 'text', nullable: true, comment: 'JSON: [{type, id, status}]' })
  attendees: string;

  // Meeting content
  @Column({ type: 'text', nullable: true })
  agenda: string;

  @Column({ type: 'text', nullable: true })
  minutes_notes: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  recording_url: string;

  // Follow-up
  @Column({ type: 'text', nullable: true, comment: 'JSON array of task IDs' })
  action_items: string;

  @Column({ type: 'timestamp', nullable: true })
  next_meeting_date: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  deleted_at: Date;

  // Relations
  @OneToOne(() => Activity, (activity) => activity.meeting, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'activity_id' })
  activity: Activity;
}