import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddPaymentTermGraceAndInvoiceSplitColumns1761000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const invoicesTable = await queryRunner.getTable('invoices');
    if (!invoicesTable) {
      return;
    }

    if (!(await queryRunner.hasColumn('invoices', 'parent_invoice_id'))) {
      await queryRunner.addColumn(
        'invoices',
        new TableColumn({
          name: 'parent_invoice_id',
          type: 'varchar',
          length: '36',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('invoices', 'is_summary_invoice'))) {
      await queryRunner.addColumn(
        'invoices',
        new TableColumn({
          name: 'is_summary_invoice',
          type: 'boolean',
          default: false,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('invoices', 'grace_due_date'))) {
      await queryRunner.addColumn(
        'invoices',
        new TableColumn({
          name: 'grace_due_date',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }

    const refreshedInvoices = await queryRunner.getTable('invoices');
    if (refreshedInvoices) {
      const hasParentFk = refreshedInvoices.foreignKeys.some(
        (fk) => fk.name === 'FK_invoices_parent_invoice_id',
      );
      if (!hasParentFk) {
        await queryRunner.createForeignKey(
          'invoices',
          new TableForeignKey({
            name: 'FK_invoices_parent_invoice_id',
            columnNames: ['parent_invoice_id'],
            referencedTableName: 'invoices',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
      }

      const invoiceIndexes: Array<{ name: string; columnNames: string[] }> = [
        {
          name: 'IDX_invoices_parent_invoice_id',
          columnNames: ['parent_invoice_id'],
        },
        {
          name: 'IDX_invoices_is_summary_invoice',
          columnNames: ['is_summary_invoice'],
        },
        {
          name: 'IDX_invoices_grace_due_date',
          columnNames: ['grace_due_date'],
        },
      ];

      for (const index of invoiceIndexes) {
        const exists = refreshedInvoices.indices.some((idx) => idx.name === index.name);
        if (!exists) {
          await queryRunner.createIndex(
            'invoices',
            new TableIndex({
              name: index.name,
              columnNames: index.columnNames,
            }),
          );
        }
      }
    }

    const installmentsTable = await queryRunner.getTable('installments');
    if (installmentsTable && !(await queryRunner.hasColumn('installments', 'grace_due_date'))) {
      await queryRunner.addColumn(
        'installments',
        new TableColumn({
          name: 'grace_due_date',
          type: 'date',
          isNullable: true,
        }),
      );

      await queryRunner.query(
        'UPDATE installments SET grace_due_date = due_date WHERE grace_due_date IS NULL',
      );

      await queryRunner.changeColumn(
        'installments',
        'grace_due_date',
        new TableColumn({
          name: 'grace_due_date',
          type: 'date',
          isNullable: false,
        }),
      );

      const refreshedInstallments = await queryRunner.getTable('installments');
      const hasGraceIndex = refreshedInstallments?.indices.some(
        (idx) => idx.name === 'IDX_installments_grace_due_date',
      );
      if (!hasGraceIndex) {
        await queryRunner.createIndex(
          'installments',
          new TableIndex({
            name: 'IDX_installments_grace_due_date',
            columnNames: ['grace_due_date'],
          }),
        );
      }
    }

    const appliedTable = await queryRunner.getTable('applied_payment_terms');
    if (
      appliedTable &&
      !(await queryRunner.hasColumn('applied_payment_terms', 'grace_period_days'))
    ) {
      await queryRunner.addColumn(
        'applied_payment_terms',
        new TableColumn({
          name: 'grace_period_days',
          type: 'int',
          default: 0,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const invoicesTable = await queryRunner.getTable('invoices');
    if (invoicesTable) {
      const parentFk = invoicesTable.foreignKeys.find(
        (fk) => fk.name === 'FK_invoices_parent_invoice_id',
      );
      if (parentFk) {
        await queryRunner.dropForeignKey('invoices', parentFk);
      }

      const invoiceIndexNames = [
        'IDX_invoices_parent_invoice_id',
        'IDX_invoices_is_summary_invoice',
        'IDX_invoices_grace_due_date',
      ];
      for (const name of invoiceIndexNames) {
        const index = invoicesTable.indices.find((idx) => idx.name === name);
        if (index) {
          await queryRunner.dropIndex('invoices', index);
        }
      }

      if (await queryRunner.hasColumn('invoices', 'parent_invoice_id')) {
        await queryRunner.dropColumn('invoices', 'parent_invoice_id');
      }

      if (await queryRunner.hasColumn('invoices', 'is_summary_invoice')) {
        await queryRunner.dropColumn('invoices', 'is_summary_invoice');
      }

      if (await queryRunner.hasColumn('invoices', 'grace_due_date')) {
        await queryRunner.dropColumn('invoices', 'grace_due_date');
      }
    }

    const installmentsTable = await queryRunner.getTable('installments');
    if (installmentsTable) {
      const graceIndex = installmentsTable.indices.find(
        (idx) => idx.name === 'IDX_installments_grace_due_date',
      );
      if (graceIndex) {
        await queryRunner.dropIndex('installments', graceIndex);
      }

      if (await queryRunner.hasColumn('installments', 'grace_due_date')) {
        await queryRunner.dropColumn('installments', 'grace_due_date');
      }
    }

    if (await queryRunner.hasColumn('applied_payment_terms', 'grace_period_days')) {
      await queryRunner.dropColumn('applied_payment_terms', 'grace_period_days');
    }
  }
}
