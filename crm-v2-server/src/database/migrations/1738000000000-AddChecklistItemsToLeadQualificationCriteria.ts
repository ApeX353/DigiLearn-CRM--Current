import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class AddChecklistItemsToLeadQualificationCriteria1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists
    const tableExists = await queryRunner.hasTable('lead_qualification_criteria');

    if (!tableExists) {
      // Create the entire table if it doesn't exist
      await queryRunner.createTable(
        new Table({
          name: 'lead_qualification_criteria',
          columns: [
            {
              name: 'id',
              type: 'varchar',
              length: '36',
              isPrimary: true,
              generationStrategy: 'uuid',
            },
            {
              name: 'lead_id',
              type: 'varchar',
              length: '36',
            },
            // BANT - Budget fields
            {
              name: 'budget_amount',
              type: 'decimal',
              precision: 15,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'budget_currency',
              type: 'varchar',
              length: '20',
              isNullable: true,
            },
            {
              name: 'budget_notes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'budget_confirmed',
              type: 'tinyint',
              width: 1,
              default: 0,
            },
            // BANT - Authority fields
            {
              name: 'decision_maker_name',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'decision_maker_title',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'authority_notes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'authority_confirmed',
              type: 'tinyint',
              width: 1,
              default: 0,
            },
            // BANT - Need fields
            {
              name: 'pain_points',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'desired_outcomes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'needs_notes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'needs_confirmed',
              type: 'tinyint',
              width: 1,
              default: 0,
            },
            // BANT - Timeline fields
            {
              name: 'target_decision_date',
              type: 'date',
              isNullable: true,
            },
            {
              name: 'target_implementation_date',
              type: 'date',
              isNullable: true,
            },
            {
              name: 'timeline_notes',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'timeline_confirmed',
              type: 'tinyint',
              width: 1,
              default: 0,
            },
            // Checklist items (JSON)
            {
              name: 'checklist_items',
              type: 'json',
              isNullable: true,
              comment: 'Flexible checklist for tracking qualification steps',
            },
            // Overall qualification
            {
              name: 'is_qualified',
              type: 'tinyint',
              width: 1,
              default: 0,
            },
            {
              name: 'qualification_score',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'qualified_by',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            {
              name: 'qualified_at',
              type: 'datetime',
              isNullable: true,
            },
            // Timestamps
            {
              name: 'created_at',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updated_at',
              type: 'datetime',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );

      // Add foreign key for lead_id
      await queryRunner.createForeignKey(
        'lead_qualification_criteria',
        new TableForeignKey({
          columnNames: ['lead_id'],
          referencedTableName: 'leads',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );

      // Add foreign key for qualified_by
      await queryRunner.createForeignKey(
        'lead_qualification_criteria',
        new TableForeignKey({
          columnNames: ['qualified_by'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'SET NULL',
        }),
      );

      // Add indexes
      await queryRunner.createIndex(
        'lead_qualification_criteria',
        new TableIndex({
          name: 'IDX_lead_qualification_criteria_lead_id',
          columnNames: ['lead_id'],
        }),
      );
    } else {
      // Table exists, just add the checklist_items column if it doesn't exist
      const hasChecklistItemsColumn = await queryRunner.hasColumn(
        'lead_qualification_criteria',
        'checklist_items',
      );

      if (!hasChecklistItemsColumn) {
        await queryRunner.addColumn(
          'lead_qualification_criteria',
          new TableColumn({
            name: 'checklist_items',
            type: 'json',
            isNullable: true,
            comment: 'Flexible checklist for tracking qualification steps',
          }),
        );
      }
    }

    // Create index on checklist_items for JSON queries (MySQL 8.0+)
    // This allows for efficient queries on JSON fields
    const hasJsonIndex = await queryRunner.query(
      `SELECT COUNT(*) as count FROM information_schema.statistics
       WHERE table_schema = DATABASE()
       AND table_name = 'lead_qualification_criteria'
       AND index_name = 'IDX_checklist_items_category'`,
    );

    if (hasJsonIndex[0].count === 0) {
      // Create a virtual column and index for efficient querying by category
      await queryRunner.query(`
        ALTER TABLE lead_qualification_criteria
        ADD COLUMN checklist_category_index VARCHAR(100)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(checklist_items, '$[0].category'))) VIRTUAL,
        ADD INDEX IDX_checklist_items_category (checklist_category_index)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('lead_qualification_criteria');

    if (tableExists) {
      // Drop the virtual column and its index first
      await queryRunner.query(`
        ALTER TABLE lead_qualification_criteria
        DROP INDEX IF EXISTS IDX_checklist_items_category,
        DROP COLUMN IF EXISTS checklist_category_index
      `);

      // Drop the checklist_items column
      const hasChecklistItemsColumn = await queryRunner.hasColumn(
        'lead_qualification_criteria',
        'checklist_items',
      );

      if (hasChecklistItemsColumn) {
        await queryRunner.dropColumn('lead_qualification_criteria', 'checklist_items');
      }

      // Note: We don't drop the entire table in down() to preserve data
      // If you want to drop the table, uncomment the following:
      // await queryRunner.dropTable('lead_qualification_criteria');
    }
  }
}
