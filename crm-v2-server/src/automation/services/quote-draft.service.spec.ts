import { QuoteDraftService } from './quote-draft.service';
import { PRICE_BOOK } from '../pricing/price-book';

describe('QuoteDraftService', () => {
  let service: QuoteDraftService;
  let dealRepo: any;

  beforeEach(() => {
    dealRepo = { findOne: jest.fn() };
    service = new QuoteDraftService(dealRepo);
  });

  it('draws real approved USD prices and suggests lines from the deal title', async () => {
    dealRepo.findOne.mockResolvedValue({
      id: 'deal-1',
      title: 'Interactive Boards, LMS, SMS',
      current_stage: { name: 'Quote Submitted' },
    });

    const draft = await service.draftForDeal('deal-1');

    expect(draft.currency).toBe('USD');
    expect(draft.fullCatalogue).toHaveLength(PRICE_BOOK.length);

    // 85" board is approved at $4,200 (not the stale CRM $3,900).
    const board85 = draft.fullCatalogue.find((l) => l.sku === 'BOARD-85');
    expect(board85?.unitPrice).toBe(4200);

    // LMS + SMS should be suggested from the title; no invented price.
    const suggestedSkus = draft.suggestedLines.map((l) => l.sku);
    expect(suggestedSkus).toEqual(expect.arrayContaining(['LMS', 'SMS', 'BOARD-85']));
    expect(draft.suggestedLines.every((l) => typeof l.unitPrice === 'number')).toBe(true);
  });

  it('throws when the deal is missing', async () => {
    dealRepo.findOne.mockResolvedValue(null);
    await expect(service.draftForDeal('nope')).rejects.toThrow('not found');
  });
});
