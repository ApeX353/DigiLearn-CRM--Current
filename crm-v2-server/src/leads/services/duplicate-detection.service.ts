import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';
import { School } from '../../schools/entities/schools.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import {
  DuplicateSuspicion,
  type DuplicateSignal,
  type DuplicateRecordType,
} from '../entities/duplicate-suspicion.entity';

/**
 * Duplicate-detection service (Phase 8).
 *
 * Two modes:
 *
 *   1. Peek   — `peekLead({...})` / `peekSchool({...})` / `peekContact`
 *               returns candidate matches with a confidence score.
 *               Called by the Add-* modals to show a warning banner.
 *               Cheap: SQL only, no writes.
 *
 *   2. Record — `recordSuspicion({...})` persists the top candidate as
 *               a `DuplicateSuspicion` row so a manager can review it.
 *               Called after a rep confirms they want to save anyway.
 *
 * The scoring heuristic is intentionally conservative — we'd rather
 * show a warning on a real duplicate than hide one. Weights:
 *
 *   phone_exact        60
 *   whatsapp_exact     55
 *   email_exact        55
 *   name_exact         35
 *   name_fuzzy         15–30  (by similarity)
 *   same_district      10
 *   same_city          5
 *
 * A candidate is flagged when its total score is >= 50. (Phone or
 * email alone is enough; fuzzy-name needs a supporting signal.)
 */

export interface DuplicateCandidate<T = any> {
  record: T;
  score: number;
  signals: DuplicateSignal[];
}

const MIN_FLAG_SCORE = 50;

function norm(s?: string | null): string {
  return (s ?? '').trim().toLowerCase();
}

function normPhone(s?: string | null): string {
  return (s ?? '').replace(/\D+/g, '');
}

// DUP-EMAIL1: reps/managers put their OWN company address in the contact
// email when they don't have the client's, so every lead they touch
// collides on the same @company email and gets falsely flagged. A shared
// STAFF email is not a client identifier — exclude these domains from the
// email-match signal. (Kept as a constant for now; move to a compliance
// setting if more internal domains appear.)
const INTERNAL_EMAIL_DOMAINS = ['clearhue.co.zw'];
function isInternalEmail(e?: string | null): boolean {
  const domain = norm(e).split('@')[1];
  return !!domain && INTERNAL_EMAIL_DOMAINS.includes(domain);
}
/** A client email worth matching on — non-empty and not a staff domain. */
function clientEmail(e?: string | null): string | null {
  return e && !isInternalEmail(e) ? norm(e) : null;
}

/**
 * Cheap Jaccard-on-tokens similarity. Good enough for catching
 * "Springfield HS" vs "Springfield High School" without pulling in a
 * proper trigram extension.
 */
function nameSimilarity(a: string, b: string): number {
  const toks = (s: string) =>
    new Set(
      norm(s)
        .replace(/[^a-z0-9 ]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const ta = toks(a);
  const tb = toks(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const uni = ta.size + tb.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(School) private readonly schoolRepo: Repository<School>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(DuplicateSuspicion)
    private readonly dupRepo: Repository<DuplicateSuspicion>,
  ) {}

  // ==============================================================
  // Peek — called by the UI while creating a new record.
  // ==============================================================

  async peekLead(input: {
    lead_name?: string;
    school_id?: string | null;
    primary_contact_id?: string | null;
    phone?: string | null;
    email?: string | null;
  }): Promise<DuplicateCandidate<Lead>[]> {
    const qb = this.leadRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.school', 'school')
      .leftJoinAndSelect('l.primary_contact', 'contact')
      .leftJoinAndSelect('l.assignee', 'assignee')
      .limit(25);

    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (input.lead_name && input.lead_name.trim()) {
      where.push('LOWER(l.lead_name) LIKE :nameLike');
      params.nameLike = `%${norm(input.lead_name).slice(0, 40)}%`;
    }
    if (input.school_id) {
      where.push('l.school_id = :sid');
      params.sid = input.school_id;
    }
    if (input.primary_contact_id) {
      where.push('l.primary_contact_id = :cid');
      params.cid = input.primary_contact_id;
    }
    if (input.phone) {
      where.push("REGEXP_REPLACE(COALESCE(contact.phone, ''), '\\D+', '', 'g') = :ph");
      params.ph = normPhone(input.phone);
    }
    const inputClientEmail = clientEmail(input.email);
    if (inputClientEmail) {
      where.push('LOWER(contact.email) = :em');
      params.em = inputClientEmail;
    }

    if (where.length === 0) return [];
    qb.where(where.join(' OR '), params);

    const rows = await qb.getMany();
    return rows
      .map((row) => {
        const signals: DuplicateSignal[] = [];
        let score = 0;

        if (
          input.phone &&
          row.primary_contact?.phone &&
          normPhone(row.primary_contact.phone) === normPhone(input.phone)
        ) {
          signals.push({ kind: 'phone_exact', weight: 60 });
          score += 60;
        }
        if (
          inputClientEmail &&
          row.primary_contact?.email &&
          !isInternalEmail(row.primary_contact.email) &&
          norm(row.primary_contact.email) === inputClientEmail
        ) {
          signals.push({ kind: 'email_exact', weight: 55 });
          score += 55;
        }
        if (
          input.school_id &&
          row.school_id &&
          row.school_id === input.school_id
        ) {
          signals.push({ kind: 'same_school', weight: 20 });
          score += 20;
        }
        if (
          input.primary_contact_id &&
          row.primary_contact_id === input.primary_contact_id
        ) {
          signals.push({ kind: 'same_contact', weight: 25 });
          score += 25;
        }
        if (input.lead_name) {
          const sim = nameSimilarity(input.lead_name, row.lead_name);
          if (sim >= 0.9) {
            signals.push({
              kind: 'name_near_exact',
              weight: 30,
              detail: `${Math.round(sim * 100)}%`,
            });
            score += 30;
          } else if (sim >= 0.6) {
            signals.push({
              kind: 'name_fuzzy',
              weight: 15,
              detail: `${Math.round(sim * 100)}%`,
            });
            score += 15;
          }
        }

        return { record: row, score, signals };
      })
      .filter((c) => c.score >= MIN_FLAG_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  async peekSchool(input: {
    name?: string;
    city?: string | null;
    district?: string | null;
    province?: string | null;
  }): Promise<DuplicateCandidate<School>[]> {
    if (!input.name || !input.name.trim()) return [];
    const nameLike = `%${norm(input.name).slice(0, 40)}%`;

    const rows = await this.schoolRepo
      .createQueryBuilder('s')
      .where('LOWER(s.name) LIKE :nameLike', { nameLike })
      .limit(25)
      .getMany();

    return rows
      .map((row) => {
        const signals: DuplicateSignal[] = [];
        let score = 0;

        // Schools carry no phone/email signal, so the lead/contact
        // weights could never reach the flag threshold here: an EXACT
        // name+city+province match scored 35+5+3 = 43 < 50 and the
        // peek returned nothing (DUP4). For a school, an exact name IS
        // the strongest available signal — it flags on its own; a
        // near-exact name needs one supporting signal (city/district).
        const sim = nameSimilarity(input.name ?? '', row.name);
        if (sim >= 0.95) {
          signals.push({
            kind: 'name_exact',
            weight: 50,
            detail: `${Math.round(sim * 100)}%`,
          });
          score += 50;
        } else if (sim >= 0.75) {
          signals.push({
            kind: 'name_near_exact',
            weight: 45,
            detail: `${Math.round(sim * 100)}%`,
          });
          score += 45;
        } else if (sim >= 0.5) {
          signals.push({
            kind: 'name_fuzzy',
            weight: 15,
            detail: `${Math.round(sim * 100)}%`,
          });
          score += 15;
        }

        if (input.district && row.district && norm(row.district) === norm(input.district)) {
          signals.push({ kind: 'same_district', weight: 10 });
          score += 10;
        }
        if (input.city && row.city && norm(row.city) === norm(input.city)) {
          signals.push({ kind: 'same_city', weight: 5 });
          score += 5;
        }
        if (
          input.province &&
          row.province &&
          norm(String(row.province)) === norm(input.province)
        ) {
          signals.push({ kind: 'same_province', weight: 3 });
          score += 3;
        }

        return { record: row, score, signals };
      })
      .filter((c) => c.score >= MIN_FLAG_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  async peekContact(input: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    email?: string | null;
    school_id?: string | null;
  }): Promise<DuplicateCandidate<Contact>[]> {
    const qb = this.contactRepo.createQueryBuilder('c').limit(25);
    const where: string[] = [];
    const params: Record<string, unknown> = {};

    if (input.phone) {
      where.push("REGEXP_REPLACE(COALESCE(c.phone, ''), '\\D+', '', 'g') = :ph");
      params.ph = normPhone(input.phone);
    }
    const inputClientEmail = clientEmail(input.email);
    if (inputClientEmail) {
      where.push('LOWER(c.email) = :em');
      params.em = inputClientEmail;
    }
    if (input.first_name && input.last_name) {
      where.push(
        '(LOWER(c.first_name) = :fn AND LOWER(c.last_name) = :ln)',
      );
      params.fn = norm(input.first_name);
      params.ln = norm(input.last_name);
    }
    if (where.length === 0) return [];
    qb.where(where.join(' OR '), params);

    const rows = await qb.getMany();
    return rows
      .map((row) => {
        const signals: DuplicateSignal[] = [];
        let score = 0;

        if (
          input.phone &&
          row.phone &&
          normPhone(row.phone) === normPhone(input.phone)
        ) {
          signals.push({ kind: 'phone_exact', weight: 60 });
          score += 60;
        }
        if (
          inputClientEmail &&
          row.email &&
          !isInternalEmail(row.email) &&
          norm(row.email) === inputClientEmail
        ) {
          signals.push({ kind: 'email_exact', weight: 55 });
          score += 55;
        }
        if (
          input.first_name &&
          input.last_name &&
          norm(row.first_name) === norm(input.first_name) &&
          norm(row.last_name) === norm(input.last_name)
        ) {
          signals.push({ kind: 'name_exact', weight: 25 });
          score += 25;
        }
        if (
          input.school_id &&
          row.school_id &&
          row.school_id === input.school_id
        ) {
          signals.push({ kind: 'same_school', weight: 10 });
          score += 10;
        }

        return { record: row, score, signals };
      })
      .filter((c) => c.score >= MIN_FLAG_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ==============================================================
  // Record — persist a suspicion row for manager review.
  // ==============================================================

  async recordSuspicion(input: {
    record_type: DuplicateRecordType;
    new_record_id: string;
    existing_record_id: string;
    score: number;
    signals: DuplicateSignal[];
    raised_by_id?: string | null;
  }): Promise<DuplicateSuspicion> {
    // De-dupe: don't re-create a pending suspicion for the same pair.
    const existing = await this.dupRepo.findOne({
      where: {
        record_type: input.record_type,
        new_record_id: input.new_record_id,
        existing_record_id: input.existing_record_id,
        status: 'pending',
      },
    });
    if (existing) return existing;

    const row = this.dupRepo.create({
      record_type: input.record_type,
      new_record_id: input.new_record_id,
      existing_record_id: input.existing_record_id,
      score: Math.max(0, Math.min(100, Math.round(input.score))),
      signals: input.signals,
      raised_by_id: input.raised_by_id ?? null,
      status: 'pending',
    });
    return this.dupRepo.save(row);
  }

  /**
   * DUP1 backfill. Suspicions were only ever meant to be written on create,
   * and that path was itself unwired — so the manager queue was empty even
   * though the live book already holds many duplicates. This scans every
   * active lead and records a pending suspicion for its strongest
   * near-duplicate, so the queue reflects the CURRENT book, not just leads
   * created after the fix. Each pair is recorded once (the higher id is
   * treated as the "new" duplicate); recordSuspicion de-dupes pending pairs,
   * so re-running is safe and idempotent. Best-effort per lead — a single
   * failure never aborts the sweep.
   */
  async rebuildLeadSuspicions(
    raisedById?: string | null,
  ): Promise<{ scanned: number; recorded: number; purged: number }> {
    // True rebuild: clear existing PENDING lead suspicions first so stale
    // or now-invalid pairs (e.g. the old staff-@company-email false matches)
    // are cleared rather than lingering. Reviewed rows (merged /
    // kept_separate / false_positive) are preserved — only pending is wiped.
    const purgeResult = await this.dupRepo.delete({
      record_type: 'lead',
      status: 'pending',
    });
    const purged = purgeResult.affected ?? 0;
    const leads = await this.leadRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.primary_contact', 'pc')
      .where('l.deleted_at IS NULL')
      .getMany();
    let recorded = 0;
    for (const lead of leads) {
      try {
        const pc = (
          lead as { primary_contact?: { phone?: string; email?: string } }
        ).primary_contact;
        const candidates = await this.peekLead({
          lead_name: lead.lead_name,
          school_id: lead.school_id,
          primary_contact_id: lead.primary_contact_id,
          phone: pc?.phone ?? null,
          email: pc?.email ?? null,
        });
        const top = candidates.find((c) => c.record.id !== lead.id);
        if (top && lead.id > top.record.id) {
          await this.recordSuspicion({
            record_type: 'lead',
            new_record_id: lead.id,
            existing_record_id: top.record.id,
            score: top.score,
            signals: top.signals,
            raised_by_id: raisedById ?? null,
          });
          recorded += 1;
        }
      } catch {
        // skip this lead; a single failure must not abort the backfill
      }
    }
    this.logger.log(
      `[DUP1 backfill] purged ${purged} stale pending, scanned ${leads.length} leads, recorded ${recorded} pending suspicions`,
    );
    return { scanned: leads.length, recorded, purged };
  }

  async list(params: {
    record_type?: DuplicateRecordType;
    status?: 'pending' | 'merged' | 'kept_separate' | 'false_positive' | 'all';
  }) {
    const qb = this.dupRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.raised_by', 'raised_by')
      .leftJoinAndSelect('d.reviewed_by', 'reviewed_by')
      .orderBy('d.created_at', 'DESC');

    const status = params.status ?? 'pending';
    if (status !== 'all') {
      qb.andWhere('d.status = :st', { st: status });
    }
    if (params.record_type) {
      qb.andWhere('d.record_type = :rt', { rt: params.record_type });
    }
    const rows = await qb.getMany();
    return this.attachRecordNames(rows);
  }

  /**
   * DUP-NAMES (Mr Dube): the queue stores only record UUIDs, so it rendered
   * database codes. Resolve each suspicion's new/existing record id to a
   * human name (lead / school / contact) so the UI shows actual names.
   */
  private async attachRecordNames(rows: DuplicateSuspicion[]) {
    const byType: Record<DuplicateRecordType, Set<string>> = {
      lead: new Set(),
      school: new Set(),
      contact: new Set(),
    };
    for (const r of rows) {
      byType[r.record_type].add(r.new_record_id);
      byType[r.record_type].add(r.existing_record_id);
    }
    const names = new Map<string, string>();
    if (byType.lead.size) {
      const leads = await this.leadRepo.find({
        where: { id: In([...byType.lead]) },
        select: ['id', 'lead_name'],
      });
      for (const l of leads)
        names.set(l.id, l.lead_name?.trim() || '(unnamed lead)');
    }
    if (byType.school.size) {
      const schools = await this.schoolRepo.find({
        where: { id: In([...byType.school]) },
        select: ['id', 'name'],
      });
      for (const s of schools)
        names.set(s.id, s.name?.trim() || '(unnamed school)');
    }
    if (byType.contact.size) {
      const contacts = await this.contactRepo.find({
        where: { id: In([...byType.contact]) },
        select: ['id', 'first_name', 'last_name'],
      });
      for (const c of contacts)
        names.set(
          c.id,
          `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() ||
            '(unnamed contact)',
        );
    }
    return rows.map((r) => ({
      ...r,
      new_record_name: names.get(r.new_record_id) ?? null,
      existing_record_name: names.get(r.existing_record_id) ?? null,
    }));
  }

  async review(
    id: string,
    status: 'merged' | 'kept_separate' | 'false_positive',
    reviewerId: string,
    note?: string | null,
  ) {
    const row = await this.dupRepo.findOneOrFail({ where: { id } });
    if (row.status !== 'pending') return row;
    row.status = status;
    row.reviewed_by_id = reviewerId;
    row.reviewed_at = new Date();
    row.review_note = note ?? null;
    return this.dupRepo.save(row);
  }
}
