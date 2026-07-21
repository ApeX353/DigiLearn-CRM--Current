import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deal } from '../../deals/entities/deal.entity';
import {
  matchItemsToTitle,
  PRICE_BOOK,
  PRICE_BOOK_APPROVED_ON,
  PRICE_BOOK_CAVEATS,
  PRICE_BOOK_CURRENCY,
  PRICE_BOOK_VALIDITY_DAYS,
  PriceBookItem,
} from '../pricing/price-book';

export interface QuoteDraftLine {
  sku: string;
  name: string;
  unit: string;
  unitPrice: number;
  suggested: boolean; // matched from the deal title vs full-catalogue
}

export interface QuoteDraft {
  dealId: string;
  title: string;
  stage: string | null;
  currency: string;
  validityDays: number;
  pricingApprovedOn: string;
  suggestedLines: QuoteDraftLine[];
  fullCatalogue: QuoteDraftLine[];
  caveats: string[];
  note: string;
}

/**
 * #8 — Quote/proposal assembly from a CRM deal.
 *
 * DECISION (Gate-0e, 2026-05-29): pricing is now resolved — the
 * service draws real, founder-approved USD prices from the canonical
 * price book (transcribed from knowledge/pricing-rules). It suggests
 * line items whose keywords match the deal title and also returns the
 * full catalogue so the rep/Nqobile can assemble the quote.
 *
 * Still honours the cardinal rule: it WRITES nothing, invents no
 * prices (every figure is an approved one), applies no discounts
 * (finance-approval-only), and a human must review and send.
 */
@Injectable()
export class QuoteDraftService {
  constructor(
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
  ) {}

  async draftForDeal(dealId: string): Promise<QuoteDraft> {
    const deal = await this.dealRepository.findOne({
      where: { id: dealId },
      relations: ['current_stage'],
    });
    if (!deal) {
      throw new NotFoundException(`Deal "${dealId}" not found`);
    }
    const anyDeal = deal as unknown as Record<string, any>;

    const toLine = (i: PriceBookItem, suggested: boolean): QuoteDraftLine => ({
      sku: i.sku,
      name: i.name,
      unit: i.unit,
      unitPrice: i.unitPriceUsd,
      suggested,
    });

    const matched = matchItemsToTitle(deal.title);
    const matchedSkus = new Set(matched.map((m) => m.sku));

    return {
      dealId: deal.id,
      title: deal.title,
      stage: anyDeal.current_stage?.name ?? null,
      currency: PRICE_BOOK_CURRENCY,
      validityDays: PRICE_BOOK_VALIDITY_DAYS,
      pricingApprovedOn: PRICE_BOOK_APPROVED_ON,
      suggestedLines: matched.map((i) => toLine(i, true)),
      fullCatalogue: PRICE_BOOK.map((i) => toLine(i, matchedSkus.has(i.sku))),
      caveats: PRICE_BOOK_CAVEATS,
      note:
        'Quantities to be set by the rep from the school’s confirmed needs. ' +
        'Prices are founder-approved (USD). No discount applied (finance approval only). ' +
        'Human review + send required.',
    };
  }
}
