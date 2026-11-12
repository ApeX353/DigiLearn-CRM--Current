jest.mock('@vercel/blob', () => ({ put: jest.fn() }));
jest.mock('../activity-logs/activity-logs.service', () => ({
  ActivityLogsService: class ActivityLogsService {},
}));
jest.mock('../leads/leads.service', () => ({
  LeadsService: class LeadsService {},
}));
jest.mock('../payment-terms/payment-terms.service', () => ({
  PaymentTermsService: class PaymentTermsService {},
}));
jest.mock('../document-generator/document-generator.service', () => ({
  DocumentGeneratorService: class DocumentGeneratorService {},
}));
jest.mock('../file-manager/file-manager.service', () => ({
  FileManagerService: class FileManagerService {},
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));
jest.mock('../auth/casl/ability-scope.service', () => ({
  AbilityScopeService: class AbilityScopeService {},
}));

import { BadRequestException } from '@nestjs/common';
import { RECORDED_PAYMENTS_MESSAGE as INVOICE_RECORDED_PAYMENTS } from './invoice-money-rules';
import { InvoicesService } from './invoices.service';

/**
 * Invoice-side money guards (BUG-043, BUG-044): an invoice with money on it
 * cannot be cancelled or deleted, and a cancelled invoice is never revived
 * by a payment recalculation.
 */
describe('InvoicesService money guards', () => {
  let service: InvoicesService;

  const invoiceRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (i: any) => i),
    remove: jest.fn(),
  };
  const documentItemRepository = { delete: jest.fn() };
  const rawQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
  };
  // FIN-02: status changes run inside a transaction with the row locked; the
  // mock manager stands in for it and hands back whatever `manager.findOne`
  // is primed with.
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(async () => []),
    query: jest.fn(async () => []),
    save: jest.fn(async (_entity: unknown, row: any) => row),
    getRepository: jest.fn(() => invoiceRepository),
    createQueryBuilder: jest.fn(() => rawQb),
  };
  const dataSource = {
    createQueryBuilder: jest.fn(() => rawQb),
    transaction: jest.fn((cb: any) => cb(manager)),
  };
  const activityLogsService = { logUpdate: jest.fn(), logDelete: jest.fn() };

  const invoice = (over: Partial<any> = {}) => ({
    id: 'inv-1',
    invoice_number: 'INV-2026-0028',
    total: '7800.00',
    amount_paid: '0.00',
    status: 'Sent',
    payment_status: 'Unpaid',
    paid_date: null,
    is_summary_invoice: false,
    parent_invoice_id: null,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoicesService(
      invoiceRepository as any,
      documentItemRepository as any,
      {} as any, // quotes
      dataSource as any,
      activityLogsService as any,
      {} as any, // payment terms
      {} as any, // document generator
      {} as any, // file manager
      {} as any, // notifications
      {} as any, // settings
      {} as any, // ability scope
      {} as any, // leads
    );
  });

  describe('updateStatus -> Cancelled', () => {
    it('refuses to cancel an invoice that has received money', async () => {
      manager.findOne.mockResolvedValue(
        invoice({ amount_paid: '3900.00', status: 'Partially-Paid' }),
      );
      await expect(service.updateStatus('inv-1', 'Cancelled', 'u1')).rejects.toThrow(
        INVOICE_RECORDED_PAYMENTS,
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('cancels an unpaid invoice as before, with the row locked', async () => {
      const row = invoice();
      manager.findOne.mockResolvedValue(row);
      jest.spyOn(service, 'findOne').mockResolvedValue({ ...row, status: 'Cancelled' } as any);
      await service.updateStatus('inv-1', 'Cancelled', 'u1');
      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'Cancelled' }),
      );
    });
  });

  describe('update (generic PUT) obeys the same money rules', () => {
    it('refuses to store Paid with nothing received', async () => {
      manager.findOne.mockResolvedValue(invoice());
      await expect(
        service.update('inv-1', { status: 'Paid' } as any, 'u1'),
      ).rejects.toThrow(/Cannot mark INV-2026-0028 as Paid: 0\.00 of 7800\.00/);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('refuses to cancel an invoice holding money', async () => {
      manager.findOne.mockResolvedValue(
        invoice({ amount_paid: '50.00', status: 'Partially-Paid' }),
      );
      await expect(
        service.update('inv-1', { status: 'Cancelled' } as any, 'u1'),
      ).rejects.toThrow(INVOICE_RECORDED_PAYMENTS);
    });
  });

  describe('recalculatePaymentStatus on a cancelled invoice', () => {
    it('refreshes the money figures but keeps the invoice Cancelled', async () => {
      const row = invoice({ status: 'Cancelled', payment_status: 'Paid', amount_paid: '7800.00' });
      invoiceRepository.findOne.mockResolvedValue(row);
      rawQb.getRawOne.mockResolvedValue({ total_paid: '3900.00' });

      await service.recalculatePaymentStatus('inv-1');

      const saved = invoiceRepository.save.mock.calls[0][0];
      expect(saved.status).toBe('Cancelled');
      expect(saved.payment_status).toBe('Partial');
      expect(saved.amount_paid).toBe(3900);
      expect(saved.paid_date).toBeNull();
    });

    it('still derives Paid for a live invoice', async () => {
      const row = invoice({ status: 'Partially-Paid' });
      invoiceRepository.findOne.mockResolvedValue(row);
      rawQb.getRawOne.mockResolvedValue({ total_paid: '7800.00' });
      await service.recalculatePaymentStatus('inv-1');
      expect(invoiceRepository.save.mock.calls[0][0].status).toBe('Paid');
    });

    it('keeps a cancelled summary parent cancelled', async () => {
      const parent = invoice({ status: 'Cancelled', is_summary_invoice: true });
      invoiceRepository.findOne.mockResolvedValue(parent);
      invoiceRepository.find.mockResolvedValue([
        { total: '3900.00', amount_paid: '3900.00' },
        { total: '3900.00', amount_paid: '0.00' },
      ]);
      await service.recalculatePaymentStatus('inv-1');
      const saved = invoiceRepository.save.mock.calls[0][0];
      expect(saved.status).toBe('Cancelled');
      expect(saved.payment_status).toBe('Partial');
    });
  });

  describe('remove', () => {
    it('refuses to delete an invoice with payments on it or its instalments', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(invoice() as any);
      rawQb.getRawOne.mockResolvedValue({ n: '2', sum: '3900.00' });
      await expect(service.remove('inv-1', 'u1')).rejects.toThrow(
        /has 2 payment\(s\) totalling 3900\.00 recorded against it and cannot be deleted/,
      );
      expect(invoiceRepository.remove).not.toHaveBeenCalled();
      expect(documentItemRepository.delete).not.toHaveBeenCalled();
      expect(rawQb.where).toHaveBeenCalledWith(
        'inv.id = :id OR inv.parent_invoice_id = :id',
        { id: 'inv-1' },
      );
    });

    it('deletes an invoice that has never been paid', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(invoice() as any);
      rawQb.getRawOne.mockResolvedValue({ n: '0', sum: '0' });
      await service.remove('inv-1', 'u1');
      expect(invoiceRepository.remove).toHaveBeenCalled();
      expect(activityLogsService.logDelete).toHaveBeenCalled();
    });

    it('is a BadRequest, so the client shows the reason', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(invoice() as any);
      rawQb.getRawOne.mockResolvedValue({ n: '1', sum: '100.00' });
      await expect(service.remove('inv-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
