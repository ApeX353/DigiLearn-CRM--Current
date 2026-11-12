import { deriveInvoiceStatus } from './finance-reconciliation.service';

/** The status the money says an invoice should carry (FIN-07b). */
describe('deriveInvoiceStatus', () => {
  it('nothing received: an issued invoice is Sent, a draft stays Draft', () => {
    expect(deriveInvoiceStatus('Paid', 7800, 0)).toEqual({ status: 'Sent', payment_status: 'Unpaid', paid_date_set: false });
    expect(deriveInvoiceStatus('Draft', 100, 0)).toEqual({ status: 'Draft', payment_status: 'Unpaid', paid_date_set: false });
  });
  it('the full amount received is Paid, whatever the badge said', () => {
    expect(deriveInvoiceStatus('Sent', 100, 100)).toEqual({ status: 'Paid', payment_status: 'Paid', paid_date_set: true });
    expect(deriveInvoiceStatus('Overdue', 100, 100.004)).toMatchObject({ status: 'Paid' });
  });
  it('part received is Partially-Paid', () => {
    expect(deriveInvoiceStatus('Paid', 100, 40)).toEqual({ status: 'Partially-Paid', payment_status: 'Partial', paid_date_set: false });
  });
  it('a cancelled invoice keeps its decision and only refreshes the money badge', () => {
    expect(deriveInvoiceStatus('Cancelled', 100, 40)).toEqual({ status: 'Cancelled', payment_status: 'Partial', paid_date_set: false });
    expect(deriveInvoiceStatus('Cancelled', 100, 0)).toMatchObject({ payment_status: 'Unpaid' });
  });
});
