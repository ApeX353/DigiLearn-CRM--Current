import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { PRODUCT_TYPES, UNITS } from '../constants';
import type { ProductType, Unit } from '../constants';

@Entity('products')
@Index(['name'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: PRODUCT_TYPES,
  })
  product_type: ProductType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Catalogue code, e.g. DLR-E-Y1. Unique when present; legacy rows stay NULL. */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  sku: string | null;

  /**
   * Sales description — prefills document line items when the product is
   * selected. PROD-BOARD rule: document_items snapshot this as text, so a
   * later edit rewrites Draft lines only, never issued documents.
   */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  tax: number;

  @Column({
    type: 'enum',
    enum: UNITS,
    default: 'piece',
  })
  unit: Unit;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at: Date | null;
}
