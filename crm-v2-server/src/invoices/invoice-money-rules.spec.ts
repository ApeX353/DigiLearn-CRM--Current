import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  assertFamilyAcceptsPayments,
  assertInstalmentCanReopen,
  assertMayUpdateInvoice,
  FAMILY_PAYMENTS_MESSAGE,
  cancellationRefusal,
  RECORDED_PAYMENTS_MESSAGE,
  rethrowInvoiceConflict,
  assertCreateStatusAllowed,
  assertItemsEditable,
  assertLineAmountsValid,
  assertStatusChangeAllowed,
} from './invoice-money-rules';

/**
 * The shared money rules (FIN-03). Every invoice writer calls these, so one
 * table of cases covers POST, PUT, PATCH /status and the item routes.
 */
describe('invoice money rules', () => {
  const inv = (over: Partial<any> = {}) => ({
    invoice_number: 'INV-2026-0001',
    total: '100.00',
    amount_paid: '0.00',
    status: 'Sent',
    ...over,
  });

  describe('assertStatusChangeAllowed', () => {
    it('refuses Paid when less than the total has been received', () => {
      expect(() => assertStatusChangeAllowed(inv({ amount_paid: '99.99' }) as any, 'Paid')).toThrow(
        /Cannot mark INV-2026-0001 as Paid: 99\.99 of 100\.00/,
      );
    });
    it('allows Paid once the total is in (to the cent)', () => {
      expect(() => assertStatusChangeAllowed(inv({ amount_paid: '100.00' }) as any, 'Paid')).not.toThrow();
    });
    it('refuses Partially-Paid with nothing received', () => {
      expect(() => assertStatusChangeAllowed(inv() as any, 'Partially-Paid')).toThrow(ConflictException);
    });
    it('refuses Cancelled when money has been received', () => {
      expect(() => assertStatusChangeAllowed(inv({ amount_paid: '1.00' }) as any, 'Cancelled')).toThrow(
        RECORDED_PAYMENTS_MESSAGE,
      );
    });
    it('allows Sent, Draft and Overdue regardless of money', () => {
      for (const s of ['Sent', 'Draft', 'Overdue'] as const) {
        expect(() => assertStatusChangeAllowed(inv({ amount_paid: '50.00' }) as any, s)).not.toThrow();
      }
    });
  });

  describe('assertCreateStatusAllowed', () => {
    it('accepts no status, Draft and Sent', () => {
      expect(() => assertCreateStatusAllowed(undefined)).not.toThrow();
      expect(() => assertCreateStatusAllowed('Draft')).not.toThrow();
      expect(() => assertCreateStatusAllowed('Sent')).not.toThrow();
    });
    it('refuses derived or lifecycle statuses on a brand-new invoice', () => {
      for (const s of ['Paid', 'Partially-Paid', 'Cancelled', 'Overdue'] as const) {
        expect(() => assertCreateStatusAllowed(s)).toThrow(/cannot be created as/);
      }
    });
  });

  describe('assertLineAmountsValid', () => {
    it('refuses a discount larger than the line amount', () => {
      expect(() =>
        assertLineAmountsValid({ description: 'Board', quantity: 1, unit_price: 100, discount: 150 }),
      ).toThrow(/discount of 150\.00 on "Board" is more than the line amount of 100\.00/);
    });
    it('allows a discount equal to the line amount (a free line)', () => {
      expect(() => assertLineAmountsValid({ quantity: 2, unit_price: 50, discount: 100 })).not.toThrow();
    });
    it('refuses negative figures', () => {
      expect(() => assertLineAmountsValid({ quantity: -1, unit_price: 10 })).toThrow(/quantity/);
      expect(() => assertLineAmountsValid({ quantity: 1, unit_price: -10 })).toThrow(/unit price/);
      expect(() => assertLineAmountsValid({ quantity: 1, unit_price: 10, tax_rate: -5 })).toThrow(/tax rate/);
    });
    it('reads string figures as Postgres returns them', () => {
      expect(() => assertLineAmountsValid({ quantity: '1.00', unit_price: '100.00', discount: '100.00' })).not.toThrow();
      expect(() => assertLineAmountsValid({ quantity: '1.00', unit_price: '100.00', discount: '100.01' })).toThrow();
    });
  });

  describe('assertItemsEditable', () => {
    it('refuses line changes once a payment is recorded', () => {
      expect(() => assertItemsEditable(inv() as any, 1)).toThrow(/has 1 payment\(s\) recorded against it/);
    });
    it('refuses line changes on a cancelled invoice', () => {
      expect(() => assertItemsEditable(inv({ status: 'Cancelled' }) as any, 0)).toThrow(/is cancelled/);
    });
    it('allows line changes on an unpaid live invoice', () => {
      expect(() => assertItemsEditable(inv() as any, 0)).not.toThrow();
    });
  });
});

describe('family status rules (EBI-FOCUS-001)', () => {
  const member = (id: string, status: string, amount_paid = '0.00') =>
    ({ id, invoice_number: id, status, total: '100.00', amount_paid }) as any;
  const parent = member('INV-P', 'Draft');
  const none = new Map<string, number>();
  const asParent = (instalments: any[]) =>
    cancellationRefusal(parent, { parent, instalments }, none);

  it('refuses a parent over an active unpaid instalment, and lists it', () => {
    const refusal = asParent([member('INV-1', 'Cancelled'), member('INV-2', 'Draft')]);
    expect(refusal?.code).toBe('INVOICE_HAS_ACTIVE_INSTALLMENTS');
    expect(refusal?.message).toContain('1 of its 2 instalments is still active');
    expect(refusal?.details).toEqual({
      invoice_number: 'INV-P',
      active_instalments: 1,
      total_instalments: 2,
      instalments: [{ invoice_number: 'INV-2', status: 'Draft' }],
    });
  });

  it('explains what cancelling an instalment means instead of telling the user to do it', () => {
    const refusal = asParent([member('INV-1', 'Draft')]);
    expect(refusal?.message).toContain('genuinely not due');
    expect(refusal?.message).toContain('what the customer is shown as owing');
  });

  it('reports money first, on the required wording, and lists the paid instalment', () => {
    const refusal = asParent([member('INV-1', 'Partially-Paid', '50.00'), member('INV-2', 'Draft')]);
    expect(refusal?.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
    expect(refusal?.message).toBe(RECORDED_PAYMENTS_MESSAGE);
    expect(refusal?.details.instalments).toEqual([
      { invoice_number: 'INV-1', status: 'Partially-Paid' },
    ]);
  });

  it('finds money in the records when the cached figure reads zero', () => {
    const refusal = cancellationRefusal(
      member('INV-1', 'Draft'),
      { parent: null, instalments: [] },
      new Map([['INV-1', 25]]),
    );
    expect(refusal?.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
  });

  it('refuses an unpaid instalment when its sibling holds money, on the family wording', () => {
    const selected = member('INV-1', 'Draft');
    const sibling = member('INV-2', 'Partially-Paid', '50.00');
    const refusal = cancellationRefusal(
      selected,
      { parent, instalments: [selected, sibling] },
      none,
    );
    expect(refusal?.code).toBe('INVOICE_HAS_RECORDED_PAYMENTS');
    expect(refusal?.message).toBe(FAMILY_PAYMENTS_MESSAGE);
    expect(refusal?.details.instalments).toEqual([
      { invoice_number: 'INV-2', status: 'Partially-Paid' },
    ]);
  });

  it('counts a sibling that holds money only in the records, or a parent holding it', () => {
    const selected = member('INV-1', 'Draft');
    const sibling = member('INV-2', 'Draft');
    const family = { parent, instalments: [selected, sibling] };
    expect(cancellationRefusal(selected, family, new Map([['INV-2', 5]]))?.code)
      .toBe('INVOICE_HAS_RECORDED_PAYMENTS');
    expect(cancellationRefusal(selected, family, new Map([['INV-P', 5]]))?.code)
      .toBe('INVOICE_HAS_RECORDED_PAYMENTS');
  });

  it('lets an unpaid instalment go when nothing in the plan holds money', () => {
    const selected = member('INV-1', 'Draft');
    const family = { parent, instalments: [selected, member('INV-2', 'Draft')] };
    expect(cancellationRefusal(selected, family, none)).toBeNull();
  });

  it('refuses a payment on a live instalment under a cancelled parent', () => {
    expect(() =>
      assertFamilyAcceptsPayments(member('INV-1', 'Draft'), member('INV-P', 'Cancelled')),
    ).toThrow(ConflictException);
    expect(() => assertFamilyAcceptsPayments(member('INV-1', 'Draft'), parent)).not.toThrow();
    expect(() => assertFamilyAcceptsPayments(member('INV-1', 'Draft'), null)).not.toThrow();
  });

  it('counts every status but Cancelled as active, including Paid with nothing received', () => {
    const refusal = asParent([member('INV-1', 'Paid')]);
    expect(refusal?.code).toBe('INVOICE_HAS_ACTIVE_INSTALLMENTS');
  });

  it('allows a parent whose instalments are all cancelled, or that has none', () => {
    expect(asParent([member('INV-1', 'Cancelled')])).toBeNull();
    expect(cancellationRefusal(parent, { parent: null, instalments: [] }, none)).toBeNull();
  });

  it('refuses to reopen an instalment under a cancelled parent', () => {
    expect(() =>
      assertInstalmentCanReopen(member('INV-1', 'Cancelled'), member('INV-P', 'Cancelled')),
    ).toThrow(/Reopen the parent first/);
  });

  it('allows reopening an instalment under a live parent', () => {
    expect(() =>
      assertInstalmentCanReopen(member('INV-1', 'Cancelled'), parent),
    ).not.toThrow();
  });

  it('lets a manager update and refuses anyone else', () => {
    expect(() => assertMayUpdateInvoice('admin')).not.toThrow();
    expect(() => assertMayUpdateInvoice('sales_manager')).not.toThrow();
    for (const role of ['sales_rep', 'manager', 'finance', undefined]) {
      expect(() => assertMayUpdateInvoice(role)).toThrow(ForbiddenException);
    }
  });

  it('turns a database deadlock into the concurrency refusal and leaves other errors alone', () => {
    for (const code of ['40P01', '40001', '55P03']) {
      expect(() => rethrowInvoiceConflict({ driverError: { code } })).toThrow(ConflictException);
    }
    const other = new Error('boom');
    expect(() => rethrowInvoiceConflict(other)).toThrow(other);
  });
});
