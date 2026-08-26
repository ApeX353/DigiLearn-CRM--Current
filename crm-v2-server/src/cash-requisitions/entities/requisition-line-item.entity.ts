import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CashRequisition } from './cash-requisition.entity';

export enum RequisitionCategory {
  FUEL = 'FUEL',
  TOLLGATE = 'TOLLGATE',
  CAR_HIRE = 'CAR_HIRE',
  TRAVEL_SUBSISTENCE = 'TRAVEL_SUBSISTENCE',
  OTHER = 'OTHER',
}

/**
 * One cost line inside a requisition (e.g. "Fuel Harare→Gweru 120L").
 * Line items live and die with their parent requisition (CASCADE),
 * which is fine because the requisition itself is the durable record.
 */
@Entity('requisition_line_items')
@Index(['requisition_id'])
export class RequisitionLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requisition_id', type: 'uuid' })
  requisition_id: string;

  @ManyToOne(() => CashRequisition, (req) => req.line_items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'requisition_id' })
  requisition: CashRequisition;

  @Column({ type: 'enum', enum: RequisitionCategory })
  category: RequisitionCategory;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
