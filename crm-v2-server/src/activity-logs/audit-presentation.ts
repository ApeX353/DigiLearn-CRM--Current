/**
 * What the Audit Trail shows for a row (AUDIT-TRAIL-001). Everything here is read
 * from what the row recorded: a value the row does not hold is left out, never
 * worked out, and no stored row is changed.
 */
export const AUDIT_CATEGORIES = ['all', 'financial', 'other'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_EVENTS = [
  'cancelled',
  'status_changed',
  'reassigned',
  'payment_recorded',
  'deal_value_changed',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

/** Lower-cased: writers disagree on case ('deal', 'Deal'). */
export const FINANCIAL_ENTITIES = [
  'quote',
  'invoice',
  'payment',
  'paymentallocation',
  'appliedpaymentterm',
  'paymentterm',
  'installment',
  'cashrequisition',
];

/**
 * What a sales manager reads in the trail: the records that role already works
 * with. An allowlist on purpose, so users, roles, settings, files, bug reports,
 * system jobs and any type added later stay out until someone decides otherwise.
 */
export const MANAGER_AUDIT_ENTITIES: readonly string[] = [
  ...FINANCIAL_ENTITIES,
  'lead',
  'deal',
  'contact',
  'school',
  'activity',
  'activitycomment',
  'product',
  'pipeline',
  'stage',
];

/**
 * The one definition of Financial, for filtering. Other is its exact negation and
 * this expression is never NULL, so All is always Financial plus Other. A deal row
 * is financial only when it carries a value.
 */
export const financialClause = (alias: string) =>
  `(LOWER(${alias}.entity) IN (:...financialEntities) OR (LOWER(${alias}.entity) = 'deal' AND ` +
  `(${alias}.new_values->>'value' IS NOT NULL OR ${alias}.old_values->>'value' IS NOT NULL)))`;

export interface AuditRow {
  entity: string;
  entity_id: string;
  action: string;
  summary?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
}

export interface AuditLookups {
  /** Invoice or quote number by record id. */
  references: Map<string, string>;
  /** Payment id to its reference and invoice number. */
  payments: Map<string, { reference: string | null; invoice_number: string | null }>;
  /** Staff name by user id. */
  users: Map<string, string>;
  /** School and deal behind an invoice or quotation, by record id. */
  context: Map<string, { school: string | null; deal: string | null }>;
}

export const emptyLookups = (): AuditLookups => ({
  references: new Map(),
  payments: new Map(),
  users: new Map(),
  context: new Map(),
});

export function auditCategory(row: Pick<AuditRow, 'entity' | 'old_values' | 'new_values'>): 'financial' | 'other' {
  const entity = row.entity.toLowerCase();
  if (FINANCIAL_ENTITIES.includes(entity)) return 'financial';
  const holdsValue = (values?: Record<string, any> | null) =>
    !!values && values.value !== undefined && values.value !== null;
  return entity === 'deal' && (holdsValue(row.old_values) || holdsValue(row.new_values))
    ? 'financial'
    : 'other';
}

const LABELS: Record<string, string> = {
  invoice: 'Invoice',
  quote: 'Quotation',
  deal: 'Deal',
  lead: 'Lead',
  activity: 'Activity',
  payment: 'Payment',
  paymentterm: 'Payment plan',
  appliedpaymentterm: 'Payment plan',
  school: 'School',
  contact: 'Contact',
};

const money = (value: unknown) =>
  Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const hasKey = (values: AuditRow['old_values'], key: string) =>
  !!values && typeof values === 'object' && key in values;

export function auditReference(row: AuditRow, lookups: AuditLookups): string | null {
  const stored = lookups.references.get(row.entity_id);
  if (stored) return stored;
  const values = { ...(row.old_values ?? {}), ...(row.new_values ?? {}) };
  return values.invoice_number ?? values.quote_number ?? null;
}

/** A readable headline, or null when the row holds nothing better than its summary. */
export function auditTitle(row: AuditRow, lookups: AuditLookups): string | null {
  const entity = row.entity.toLowerCase();
  const label = LABELS[entity] ?? row.entity;
  const before = row.old_values ?? {};
  const after = row.new_values ?? {};

  if (entity === 'payment' && row.action === 'create' && after.amount !== undefined) {
    const payment = lookups.payments.get(row.entity_id);
    const invoice = payment?.invoice_number ?? lookups.references.get(after.invoice_id);
    return `Payment recorded: ${money(after.amount)}${invoice ? ` on ${invoice}` : ''}`;
  }
  if (entity === 'payment' && row.action === 'delete' && before.amount !== undefined) {
    return `Payment removed: ${money(before.amount)}`;
  }

  // Conversion writes a fixed previous status whatever the quote really held, so it
  // is not a fact to repeat. QUO-2026-0104 was Draft and logged Sent.
  if (entity === 'quote' && /converted to invoice/i.test(row.summary ?? '')) {
    return 'Quotation accepted and converted to an invoice';
  }

  if (hasKey(before, 'status') && hasKey(after, 'status') && before.status !== after.status) {
    return `${label} status: ${before.status} → ${after.status}`;
  }

  if (hasKey(before, 'assigned_to') && hasKey(after, 'assigned_to') && before.assigned_to !== after.assigned_to) {
    const person = (id: string | null) =>
      id ? (lookups.users.get(id) ?? 'a user no longer on record') : 'Unassigned';
    return `${label} reassigned: ${person(before.assigned_to)} → ${person(after.assigned_to)}`;
  }

  if (entity === 'deal' && hasKey(before, 'value') && hasKey(after, 'value') && Number(before.value) !== Number(after.value)) {
    return `Deal value: ${money(before.value)} → ${money(after.value)}`;
  }

  if (hasKey(before, 'role') && hasKey(after, 'role') && before.role !== after.role) {
    return `Staff role: ${before.role} → ${after.role}`;
  }

  if (row.action === 'create') return `${label} created`;
  if (row.action === 'delete') return `${label} deleted`;
  return null;
}
