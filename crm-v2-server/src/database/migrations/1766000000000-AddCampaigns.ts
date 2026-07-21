import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * Campaign/event cost tracking (NASH congress etc.):
 *
 *  - `campaigns` table — the event itself.
 *  - `cash_requisitions.campaign_id` — campaign-level costs (stand
 *    fees, travel) attached to the campaign, not any lead/deal. The
 *    one-linkage-only rule stays enforced in the service, matching
 *    how deal/lead linkage is already policed.
 *  - `leads.source_campaign_id` / `deals.source_campaign_id` — lead
 *    provenance; the deal copy is written at conversion time so ROI
 *    follows the lifecycle.
 *
 * All FKs are ON DELETE SET NULL: deleting a campaign never deletes
 * costs or demotes leads — they just lose the tag. Everything is
 * hasTable/hasColumn-guarded, consistent with the other migrations.
 */
export class AddCampaigns1766000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('campaigns'))) {
      await queryRunner.createTable(
        new Table({
          name: 'campaigns',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'uuid_generate_v4()',
            },
            { name: 'name', type: 'varchar', length: '200' },
            {
              name: 'type',
              type: 'enum',
              enumName: 'campaigns_type_enum',
              enum: ['CONFERENCE', 'ROADSHOW', 'OTHER'],
              default: `'OTHER'`,
            },
            { name: 'start_date', type: 'date' },
            { name: 'end_date', type: 'date', isNullable: true },
            { name: 'currency', type: 'varchar', length: '3', default: `'USD'` },
            { name: 'created_by_id', type: 'uuid' },
            { name: 'created_at', type: 'timestamp', default: 'now()' },
            { name: 'updated_at', type: 'timestamp', default: 'now()' },
          ],
          foreignKeys: [
            new TableForeignKey({
              columnNames: ['created_by_id'],
              referencedTableName: 'users',
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT',
            }),
          ],
          indices: [
            new TableIndex({
              name: 'idx_campaigns_created_by',
              columnNames: ['created_by_id'],
            }),
          ],
        }),
      );
    }

    const addCampaignRef = async (
      table: string,
      column: string,
      indexName: string,
    ) => {
      if (!(await queryRunner.hasColumn(table, column))) {
        await queryRunner.addColumn(
          table,
          new TableColumn({ name: column, type: 'uuid', isNullable: true }),
        );
        await queryRunner.createForeignKey(
          table,
          new TableForeignKey({
            columnNames: [column],
            referencedTableName: 'campaigns',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
        await queryRunner.createIndex(
          table,
          new TableIndex({ name: indexName, columnNames: [column] }),
        );
      }
    };

    await addCampaignRef(
      'cash_requisitions',
      'campaign_id',
      'idx_cashreq_campaign',
    );
    await addCampaignRef(
      'leads',
      'source_campaign_id',
      'idx_leads_source_campaign',
    );
    await addCampaignRef(
      'deals',
      'source_campaign_id',
      'idx_deals_source_campaign',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of [
      ['deals', 'source_campaign_id'],
      ['leads', 'source_campaign_id'],
      ['cash_requisitions', 'campaign_id'],
    ] as const) {
      if (await queryRunner.hasColumn(table, column)) {
        await queryRunner.dropColumn(table, column); // drops FK + index with it
      }
    }
    if (await queryRunner.hasTable('campaigns')) {
      await queryRunner.dropTable('campaigns');
      await queryRunner.query(`DROP TYPE IF EXISTS "campaigns_type_enum"`);
    }
  }
}
