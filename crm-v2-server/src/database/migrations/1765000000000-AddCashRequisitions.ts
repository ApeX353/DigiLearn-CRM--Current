import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cash Requisition / Deal Cost tracking (Stage 1).
 *
 * Two tables:
 *  - cash_requisitions: a rep's request for money (PRE_APPROVAL) or a
 *    claim for money already spent (REIMBURSEMENT), linked to a deal
 *    or a lead, with a two-stage approval trail (manager → finance)
 *    and a PAID terminus.
 *  - requisition_line_items: itemised costs inside a requisition.
 *
 * Durability: deal_id / lead_id are ON DELETE SET NULL — cost history
 * must survive the commercial object. Winning/losing a deal never
 * touches these rows at all (that's just deal.close_status).
 *
 * Guarded with hasTable like every other incremental migration so it
 * no-ops if a future baseline already contains the tables.
 */
export class AddCashRequisitions1765000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('cash_requisitions'))) {
      await queryRunner.query(
        `CREATE TYPE "public"."cash_requisitions_type_enum" AS ENUM('PRE_APPROVAL', 'REIMBURSEMENT')`,
      );
      await queryRunner.query(
        `CREATE TYPE "public"."cash_requisitions_status_enum" AS ENUM('DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED', 'PAID', 'REJECTED')`,
      );
      await queryRunner.query(
        `CREATE TYPE "public"."cash_requisitions_currency_enum" AS ENUM('USD', 'ZWG')`,
      );
      await queryRunner.query(`CREATE TABLE "cash_requisitions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "public"."cash_requisitions_type_enum" NOT NULL,
        "status" "public"."cash_requisitions_status_enum" NOT NULL DEFAULT 'DRAFT',
        "requested_by_id" uuid NOT NULL,
        "deal_id" uuid,
        "lead_id" uuid,
        "currency" "public"."cash_requisitions_currency_enum" NOT NULL,
        "total_amount" numeric(15,2) NOT NULL DEFAULT '0',
        "reason" text NOT NULL,
        "submitted_at" TIMESTAMP,
        "manager_actioned_by_id" uuid,
        "manager_actioned_at" TIMESTAMP,
        "finance_actioned_by_id" uuid,
        "finance_actioned_at" TIMESTAMP,
        "rejection_reason" text,
        "rejected_stage" character varying(20),
        "paid_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_requisitions" PRIMARY KEY ("id")
      )`);
      await queryRunner.query(
        `CREATE INDEX "IDX_cash_requisitions_deal_id" ON "cash_requisitions" ("deal_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_cash_requisitions_lead_id" ON "cash_requisitions" ("lead_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_cash_requisitions_requested_by" ON "cash_requisitions" ("requested_by_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_cash_requisitions_status" ON "cash_requisitions" ("status")`,
      );
      await queryRunner.query(
        `ALTER TABLE "cash_requisitions" ADD CONSTRAINT "FK_cashreq_requested_by" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE "cash_requisitions" ADD CONSTRAINT "FK_cashreq_deal" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE "cash_requisitions" ADD CONSTRAINT "FK_cashreq_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE "cash_requisitions" ADD CONSTRAINT "FK_cashreq_manager_actioned_by" FOREIGN KEY ("manager_actioned_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE "cash_requisitions" ADD CONSTRAINT "FK_cashreq_finance_actioned_by" FOREIGN KEY ("finance_actioned_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
      );
    }

    if (!(await queryRunner.hasTable('requisition_line_items'))) {
      await queryRunner.query(
        `CREATE TYPE "public"."requisition_line_items_category_enum" AS ENUM('FUEL', 'TOLLGATE', 'CAR_HIRE', 'TRAVEL_SUBSISTENCE', 'OTHER')`,
      );
      await queryRunner.query(`CREATE TABLE "requisition_line_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requisition_id" uuid NOT NULL,
        "category" "public"."requisition_line_items_category_enum" NOT NULL,
        "description" character varying(500) NOT NULL,
        "amount" numeric(15,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_requisition_line_items" PRIMARY KEY ("id")
      )`);
      await queryRunner.query(
        `CREATE INDEX "IDX_requisition_line_items_requisition" ON "requisition_line_items" ("requisition_id")`,
      );
      await queryRunner.query(
        `ALTER TABLE "requisition_line_items" ADD CONSTRAINT "FK_lineitem_requisition" FOREIGN KEY ("requisition_id") REFERENCES "cash_requisitions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "requisition_line_items"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."requisition_line_items_category_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cash_requisitions"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cash_requisitions_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cash_requisitions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cash_requisitions_currency_enum"`,
    );
  }
}
