import { BadRequestException } from '@nestjs/common';
import {
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
      expect(() => assertStatusChangeAllowed(inv() as any, 'Partially-Paid')).toThrow(BadRequestException);
    });
    it('refuses Cancelled when money has been received', () => {
      expect(() => assertStatusChangeAllowed(inv({ amount_paid: '1.00' }) as any, 'Cancelled')).toThrow(
        /Cannot cancel INV-2026-0001: 1\.00 has been received/,
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
