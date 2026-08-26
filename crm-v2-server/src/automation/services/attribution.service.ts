import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../leads/entities/lead.entity';

export interface SourceAttributionRow {
  source: string;
  total: number;
  converted: number;
  conversionRate: number;
}

/**
 * #12 — Marketing→CRM attribution loop (read-only).
 *
 * Marketing can't see CRM outcomes, so spend isn't tuned. This rolls
 * leads up by `source` with conversion, so social/marketing-originated
 * leads (tagged by #9) can be reported back against everything else.
 * Strictly downstream of #9: until handoff tagging is live, the
 * "Social Media" row reflects only manually-tagged leads.
 */
@Injectable()
export class AttributionService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
  ) {}

  async getSourceAttribution(): Promise<SourceAttributionRow[]> {
    const rows = await this.leadRepository
      .createQueryBuilder('lead')
      .select('lead.source', 'source')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN lead.status = 'Converted' THEN 1 ELSE 0 END)`,
        'converted',
      )
      .where('lead.deleted_at IS NULL')
      .groupBy('lead.source')
      .getRawMany<{ source: string | null; total: string; converted: string }>();

    return rows.map((r) => {
      const total = Number(r.total);
      const converted = Number(r.converted);
      return {
        source: r.source ?? 'Unknown',
        total,
        converted,
        conversionRate: total > 0 ? converted / total : 0,
      };
    });
  }
}
