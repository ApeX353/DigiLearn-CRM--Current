/**
 * Campaign 001 — synthetic fixtures.
 *
 * Everything here is invented data written with plain SQL into the
 * disposable database. No customer record, production snapshot or real
 * credential is used. Rows are inserted directly (not through application
 * services) so that tests can later check what the application does against
 * a state the test controls.
 *
 * `insertRow` fills NOT NULL columns that have no default by inspecting
 * information_schema, so fixtures stay valid when a migration adds a
 * mandatory column: enum columns take their first label, text columns a
 * marker string, numbers 0, booleans true, dates now.
 */
import { randomBytes, randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

export interface PermissionSpec {
  action: string;
  subject: string;
  /** JSON string stored on role_permissions.conditions; null = unconditional */
  conditions?: string | null;
  inverted?: boolean;
}

export interface FixtureUser {
  id: string;
  email: string;
  roleNames: string[];
}

export interface FixtureSession {
  id: string;
  userId: string;
}

export class Fixtures {
  private readonly tag = randomBytes(3).toString('hex');
  private columnCache = new Map<string, ColumnInfo[]>();

  constructor(
    private readonly ds: DataSource,
    private readonly jwt: JwtService,
  ) {}

  // ---------------------------------------------------------------- generic

  private async columns(table: string): Promise<ColumnInfo[]> {
    const cached = this.columnCache.get(table);
    if (cached) return cached;
    const rows: ColumnInfo[] = await this.ds.query(
      `select column_name, data_type, udt_name, is_nullable, column_default
         from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position`,
      [table],
    );
    if (rows.length === 0) throw new Error(`fixture: table "${table}" does not exist`);
    this.columnCache.set(table, rows);
    return rows;
  }

  private async firstEnumLabel(udtName: string): Promise<string> {
    const rows: Array<{ enumlabel: string }> = await this.ds.query(
      `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = $1 order by e.enumsortorder limit 1`,
      [udtName],
    );
    if (rows.length === 0) throw new Error(`fixture: enum "${udtName}" has no labels`);
    return rows[0].enumlabel;
  }

  private async fillerFor(col: ColumnInfo): Promise<unknown> {
    switch (col.data_type) {
      case 'USER-DEFINED':
        return this.firstEnumLabel(col.udt_name);
      case 'uuid':
        return randomUUID();
      case 'character varying':
      case 'text':
      case 'character':
        return `fx-${this.tag}`;
      case 'integer':
      case 'smallint':
      case 'bigint':
      case 'numeric':
      case 'double precision':
      case 'real':
        return 0;
      case 'boolean':
        return true;
      case 'date':
      case 'timestamp without time zone':
      case 'timestamp with time zone':
        return new Date();
      case 'json':
      case 'jsonb':
        return '{}';
      default:
        throw new Error(`fixture: no filler for ${col.column_name} (${col.data_type})`);
    }
  }

  /** Inserts one row, filling mandatory columns not given, and returns it. */
  async insertRow<T = any>(table: string, values: Record<string, unknown>): Promise<T> {
    const cols = await this.columns(table);
    const row: Record<string, unknown> = { ...values };
    for (const col of cols) {
      if (col.column_name in row) continue;
      if (col.is_nullable === 'YES' || col.column_default !== null) continue;
      row[col.column_name] = await this.fillerFor(col);
    }
    const names = Object.keys(row);
    const placeholders = names.map((_, i) => `$${i + 1}`);
    const sql = `insert into "${table}" (${names.map((n) => `"${n}"`).join(', ')})
                 values (${placeholders.join(', ')}) returning *`;
    const inserted = await this.ds.query(sql, names.map((n) => row[n]));
    return inserted[0] as T;
  }

  // -------------------------------------------------------------- security

  /** Find-or-create a permissions row; (action, subject, inverted) is unique. */
  async permission(action: string, subject: string, inverted = false): Promise<string> {
    const found: Array<{ id: string }> = await this.ds.query(
      'select id from permissions where action = $1 and subject = $2 and inverted = $3',
      [action, subject, inverted],
    );
    if (found.length) return found[0].id;
    const row = await this.insertRow('permissions', {
      action,
      subject,
      inverted,
      conditions: null,
      description: `campaign001 ${action} ${subject}${inverted ? ' (inverted)' : ''}`,
      is_active: true,
    });
    return row.id;
  }

  /** Creates a role carrying the given permission grants. */
  async role(name: string, perms: PermissionSpec[]): Promise<{ id: string; name: string }> {
    const fullName = `${name}_${this.tag}`;
    const role = await this.insertRow('roles', {
      name: fullName,
      description: `campaign001 role ${name}`,
      is_active: true,
      is_system_role: false,
    });
    for (const p of perms) {
      const permissionId = await this.permission(p.action, p.subject, p.inverted ?? false);
      await this.insertRow('role_permissions', {
        role_id: role.id,
        permission_id: permissionId,
        conditions: p.conditions ?? null,
        is_active: true,
      });
    }
    return { id: role.id, name: fullName };
  }

  async user(
    label: string,
    roles: Array<{ id: string; name: string }>,
    opts: { isActive?: boolean } = {},
  ): Promise<FixtureUser> {
    const email = `${label}.${this.tag}@test.invalid`;
    const user = await this.insertRow('users', {
      email,
      first_name: label,
      last_name: 'Synthetic',
      is_active: opts.isActive ?? true,
    });
    for (const r of roles) {
      await this.ds.query('insert into user_roles (user_id, role_id) values ($1, $2)', [
        user.id,
        r.id,
      ]);
    }
    return { id: user.id, email, roleNames: roles.map((r) => r.name) };
  }

  async session(user: FixtureUser, opts: { active?: boolean } = {}): Promise<FixtureSession> {
    const row = await this.insertRow('auth_sessions', {
      user_id: user.id,
      refresh_token_hash: randomBytes(32).toString('hex'),
      expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      is_active: opts.active ?? true,
      revoked_at: opts.active === false ? new Date() : null,
      revoke_reason: opts.active === false ? 'campaign001 revoked' : null,
    });
    return { id: row.id, userId: user.id };
  }

  async revokeSession(session: FixtureSession): Promise<void> {
    await this.ds.query(
      'update auth_sessions set is_active = false, revoked_at = now(), revoke_reason = $2 where id = $1',
      [session.id, 'campaign001 revoked'],
    );
  }

  /** Signs an access token exactly as AuthService does (same JwtService, same secret). */
  token(user: FixtureUser, session: FixtureSession, opts: { expiresIn?: string } = {}): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email, roles: user.roleNames, sessionId: session.id },
      opts.expiresIn ? { expiresIn: opts.expiresIn } : undefined,
    );
  }

  /** A fully usable bearer token for a fresh active session. */
  async bearer(user: FixtureUser): Promise<{ token: string; session: FixtureSession }> {
    const session = await this.session(user);
    return { token: this.token(user, session), session };
  }

  // ------------------------------------------------------------------ CRM

  async school(label: string): Promise<{ id: string }> {
    const row = await this.insertRow('schools', { name: `${label} School ${this.tag}` });
    return { id: row.id };
  }

  async contact(schoolId: string, label: string): Promise<{ id: string }> {
    const row = await this.insertRow('contacts', {
      school_id: schoolId,
      first_name: label,
      last_name: 'Contact',
      email: `${label}.${this.tag}@contact.invalid`,
    });
    return { id: row.id };
  }

  async lead(label: string, assignedTo: string | null, schoolId?: string): Promise<{ id: string; name: string }> {
    const name = `${label} lead ${this.tag}`;
    const row = await this.insertRow('leads', {
      lead_name: name,
      assigned_to: assignedTo,
      school_id: schoolId ?? null,
    });
    return { id: row.id, name };
  }

  // -------------------------------------------------------------- finance

  async invoice(opts: {
    ownerId: string;
    schoolId: string;
    total: number;
    status?: string;
    paymentStatus?: string;
    personId?: string | null;
  }): Promise<{ id: string; invoice_number: string }> {
    const row = await this.insertRow('invoices', {
      invoice_number: `TST-${this.tag}-${randomBytes(2).toString('hex')}`,
      owner_id: opts.ownerId,
      school_id: opts.schoolId,
      person_id: opts.personId ?? null,
      client_name: `Synthetic client ${this.tag}`,
      status: opts.status ?? 'Sent',
      payment_status: opts.paymentStatus ?? 'Unpaid',
      subtotal: opts.total,
      tax: 0,
      discount: 0,
      total: opts.total,
      amount_paid: 0,
    });
    return { id: row.id, invoice_number: row.invoice_number };
  }

  async payment(invoiceId: string, amount: number, reference?: string): Promise<{ id: string }> {
    const row = await this.insertRow('payments', {
      invoice_id: invoiceId,
      amount,
      payment_date: new Date(),
      method: 'cash',
      reference: reference ?? `PAY-${this.tag}-${randomBytes(3).toString('hex')}`,
      allocated_amount: 0,
      unallocated_amount: amount,
    });
    return { id: row.id };
  }

  async appliedTermWithInstallments(opts: {
    invoiceId: string;
    total: number;
    amounts: number[];
  }): Promise<{ appliedTermId: string; installmentIds: string[] }> {
    const apt = await this.insertRow('applied_payment_terms', {
      document_id: opts.invoiceId,
      document_type: 'invoice',
      term_name: `campaign001 ${opts.amounts.length} instalments`,
      interest_rate: 0,
      subtotal: opts.total,
      interest_amount: 0,
      total_amount: opts.total,
      number_of_installments: opts.amounts.length,
      grace_period_days: 0,
      start_date: new Date(),
    });
    const installmentIds: string[] = [];
    let n = 1;
    for (const amount of opts.amounts) {
      const due = new Date(Date.now() + n * 30 * 24 * 3600 * 1000);
      const inst = await this.insertRow('installments', {
        applied_payment_term_id: apt.id,
        invoice_id: opts.invoiceId,
        installment_number: n,
        amount,
        paid_amount: 0,
        balance: amount,
        due_date: due,
        grace_due_date: due,
      });
      installmentIds.push(inst.id);
      n += 1;
    }
    return { appliedTermId: apt.id, installmentIds };
  }
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}
