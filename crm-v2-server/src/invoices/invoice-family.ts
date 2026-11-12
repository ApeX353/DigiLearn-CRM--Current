import type { EntityManager } from 'typeorm';
import type { InvoiceStatus } from './constants';

/**
 * What the screens need to tell an invoice's own status from its family's
 * (EBI-FOCUS-001). `status` stays the row's own; these two fields only describe
 * the relatives, so "1 of 2 instalments cancelled" never relabels the parent.
 */
export interface InvoiceFamilyFields {
  /** On a parent: how many instalments it has and how many are cancelled. */
  family_summary: { instalments: number; cancelled: number } | null;
  /** On an instalment: its parent's own status. */
  parent_status: InvoiceStatus | null;
  /** On an instalment: its parent's number. */
  parent_invoice_number: string | null;
}

interface FamilyRow {
  id: string;
  parent_invoice_id?: string | null;
}

/** Sets the two fields on each row, in place. Reads only. */
export async function withFamilyFields<T extends FamilyRow>(
  db: Pick<EntityManager, 'query'>,
  rows: T[],
): Promise<Array<T & InvoiceFamilyFields>> {
  const parentIds = rows
    .map((row) => row.parent_invoice_id)
    .filter((id): id is string => !!id);

  const counts: Array<{ id: string; instalments: number; cancelled: number }> =
    rows.length
      ? await db.query(
          `SELECT parent_invoice_id AS id,
                  COUNT(*)::int AS instalments,
                  (COUNT(*) FILTER (WHERE status = 'Cancelled'))::int AS cancelled
             FROM invoices
            WHERE parent_invoice_id = ANY($1::uuid[])
            GROUP BY parent_invoice_id`,
          [rows.map((row) => row.id)],
        )
      : [];
  const parents: Array<{ id: string; status: InvoiceStatus; invoice_number: string }> =
    parentIds.length
      ? await db.query(
          `SELECT id, status, invoice_number FROM invoices WHERE id = ANY($1::uuid[])`,
          [parentIds],
        )
      : [];

  const summaryById = new Map(
    counts.map(({ id, instalments, cancelled }) => [
      id,
      { instalments, cancelled },
    ]),
  );
  const parentById = new Map(parents.map((parent) => [parent.id, parent]));

  return rows.map((row) =>
    Object.assign(row, {
      family_summary: summaryById.get(row.id) ?? null,
      parent_status: parentById.get(row.parent_invoice_id ?? '')?.status ?? null,
      parent_invoice_number:
        parentById.get(row.parent_invoice_id ?? '')?.invoice_number ?? null,
    }),
  );
}
