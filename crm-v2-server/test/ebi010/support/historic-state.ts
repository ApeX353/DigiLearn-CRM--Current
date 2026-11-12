/**
 * ISOLATED FIXTURE for a state the application refuses to create.
 *
 * Since EBI-FOCUS-001 a parent with active instalments cannot be cancelled, so no
 * route can produce a cancelled parent over live instalments. Rows like that were
 * written before the rule and remain in the data: in the 28 Oct 2026 production
 * snapshot, INV-2026-0030 and 0058 are Cancelled with Draft instalments 0032 and
 * 0061. The 010-series rule "a child of a cancelled parent is counted nowhere" is
 * what keeps those rows out of every figure, so it must stay proven.
 *
 * This writes the row directly for that one purpose. It is not a way round the
 * rule: use it only in a test whose subject is how such historic rows are treated.
 */
import { DataSource } from 'typeorm';

export const makeHistoricCancelledParent = (ds: DataSource, parentId: string) =>
  ds.query(`update invoices set status = 'Cancelled' where id = $1`, [parentId]);

/**
 * The same kind of state: an instalment cancelled while holding a receipt, which
 * the money rules now refuse. The snapshot holds such rows (INV-2026-0028, 0036,
 * 0041, each cancelled with money on it), and money there still counts as money in
 * the family.
 */
export const makeHistoricCancelledInstalment = (ds: DataSource, id: string) =>
  ds.query(`update invoices set status = 'Cancelled' where id = $1`, [id]);
