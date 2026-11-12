jest.mock('../invoices/invoices.service', () => ({
  InvoicesService: class InvoicesService {},
}));
jest.mock('../payment-terms/payment-terms.service', () => ({
  PaymentTermsService: class PaymentTermsService {},
}));
jest.mock('../activity-logs/activity-logs.service', () => ({
  ActivityLogsService: class ActivityLogsService {},
}));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class SettingsService {},
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentsService, hashPaymentPayload } from './payments.service';
import { Invoice } from '../invoices/entities/invoice.entity';

/**
 * Money guards on create and update (BUG-017, BUG-042, BUG-043 half):
 * a payment never exceeds the balance owed, a cancelled invoice takes no
 * money, and the same amount + reference within two minutes is a retry.
 *
 * Since FIN-02 (19 Oct 2026) every write runs inside one transaction with
 * the invoice row locked; the mock manager below stands in for it. The
 * invoice the service judges is the LOCKED row (manager.findOne), which the
 * tests feed through `invoicesService.findOne` so the fixtures read the same.
 */
describe('PaymentsService money guards', () => {
  let service: PaymentsService;

  /** One query-builder mock serving both the balance sum and the twin lookup. */
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getOne: jest.fn(),
  };
  const invoicesService = {
    findOne: jest.fn(),
    recalculatePaymentStatus: jest.fn(),
  };
  /** payment_commands (FIN-04): the durable identity of each "record a payment". */
  const commandRepo = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
  };
  const manager = {
    findOne: jest.fn((entity: unknown, opts: any) =>
      entity === Invoice
        ? invoicesService.findOne(opts?.where?.id)
        : paymentRepository.findOne(opts),
    ),
    withRepository: jest.fn((repo: any) => repo),
    getRepository: jest.fn(() => commandRepo),
  };
  const paymentRepository: any = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (p: any) => ({ id: 'pay-new', ...p })),
    findOne: jest.fn(),
    remove: jest.fn(),
    manager: {
      connection: { transaction: jest.fn((cb: any) => cb(manager)) },
    },
  };
  const paymentTermsService = {
    findAppliedTermByDocument: jest.fn().mockResolvedValue(null),
    allocatePaymentFIFO: jest.fn(),
    reversePaymentAllocations: jest.fn(),
  };
  const activityLogsService = {
    logCreate: jest.fn(),
    logUpdate: jest.fn(),
  };

  const invoice = (over: Partial<any> = {}) => ({
    id: 'inv-1',
    invoice_number: 'INV-2026-0001',
    total: '1000.00',
    status: 'Sent',
    is_summary_invoice: false,
    owner_id: 'rep-1',
    parent_invoice_id: null,
    ...over,
  });

  const dto = (over: Partial<any> = {}) => ({
    invoice_id: 'inv-1',
    amount: 400,
    payment_date: '2026-09-11T00:00:00.000Z',
    reference: 'REF-1',
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    qb.getRawOne.mockResolvedValue({ received: '0' });
    qb.getOne.mockResolvedValue(null);
    commandRepo.findOne.mockResolvedValue(null);
    service = new PaymentsService(
      paymentRepository as any,
      invoicesService as any,
      paymentTermsService as any,
      activityLogsService as any,
      {} as any,
    );
  });

  describe('create', () => {
    it('records a payment within the balance', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      qb.getRawOne.mockResolvedValue({ received: '500.00' });
      const saved = await service.create(dto({ amount: 500 }) as any, 'u1');
      expect(saved.id).toBe('pay-new');
      expect(paymentRepository.save).toHaveBeenCalled();
      // A fresh receipt holds all its money unallocated (amount = allocated + unallocated).
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ allocated_amount: 0, unallocated_amount: 500 }),
      );
      // Recalculated inside the same transaction (the manager is passed along).
      expect(invoicesService.recalculatePaymentStatus).toHaveBeenCalledWith('inv-1', manager);
      // The invoice row was locked for the write.
      expect(manager.findOne).toHaveBeenCalledWith(
        Invoice,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('refuses a payment above what is still owed', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      qb.getRawOne.mockResolvedValue({ received: '700.00' });
      await expect(service.create(dto({ amount: 400 }) as any, 'u1')).rejects.toThrow(
        /exceeds the 300\.00 still owed on INV-2026-0001/,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('accepts a payment that settles the balance exactly', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      qb.getRawOne.mockResolvedValue({ received: '600.00' });
      await expect(service.create(dto({ amount: 400 }) as any, 'u1')).resolves.toBeDefined();
    });

    it('refuses money against a cancelled invoice', async () => {
      invoicesService.findOne.mockResolvedValue(invoice({ status: 'Cancelled' }));
      await expect(service.create(dto() as any, 'u1')).rejects.toThrow(
        /is cancelled and cannot accept payments/,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('still refuses a summary invoice', async () => {
      invoicesService.findOne.mockResolvedValue(invoice({ is_summary_invoice: true }));
      await expect(service.create(dto() as any, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('still accepts a Draft invoice (how production records cash)', async () => {
      invoicesService.findOne.mockResolvedValue(invoice({ status: 'Draft' }));
      await expect(service.create(dto() as any, 'u1')).resolves.toBeDefined();
    });

    it('claims the command identity (invoice + reference) in the same transaction', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      await service.create(dto() as any, 'u1');
      expect(commandRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ command_key: 'natural:inv-1:ref-1', payment_id: null }),
      );
      expect(commandRepo.update).toHaveBeenCalledWith(
        { command_key: expect.anything() },
        expect.objectContaining({ payment_id: 'pay-new' }),
      );
    });

    it('with a client key, claims the client key AND the bank-reference identity', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      await service.create(dto() as any, 'u1', undefined, 'form-abc12345');
      const keys = commandRepo.insert.mock.calls.map((c: any[]) => c[0].command_key);
      expect(keys).toEqual(['client:u1:form-abc12345', 'natural:inv-1:ref-1']);
    });

    it('refuses a reference already recorded even when the new request carries a fresh client key', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      commandRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.command_key.startsWith('natural:')
          ? { command_key: where.command_key, payment_id: 'pay-1', payload_hash: 'old' }
          : null,
      );
      paymentRepository.findOne.mockResolvedValue({
        id: 'pay-1',
        amount: '400.00',
        reference: 'REF-1',
        created_at: new Date('2026-08-01T10:00:00Z'),
      });
      await expect(
        service.create(dto() as any, 'u1', undefined, 'form-new-key-9'),
      ).rejects.toThrow(/already recorded on INV-2026-0001/);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('refuses a second payment with a reference already recorded on the invoice, however long ago', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      commandRepo.findOne.mockResolvedValue({
        command_key: 'natural:inv-1:ref-1',
        payment_id: 'pay-1',
        payload_hash: 'something-else',
      });
      paymentRepository.findOne.mockResolvedValue({
        id: 'pay-1',
        amount: '400.00',
        reference: 'REF-1',
        created_at: new Date('2026-08-01T10:00:00Z'),
      });
      await expect(service.create(dto() as any, 'u1')).rejects.toThrow(
        /A payment of 400\.00 with reference "REF-1" is already recorded on INV-2026-0001 \(2026-08-01\)/,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('answers a replay of the same client key and details with the original payment', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      const body = dto();
      commandRepo.findOne.mockResolvedValue({
        command_key: 'client:u1:form-abc12345',
        payment_id: 'pay-1',
        payload_hash: hashPaymentPayload(body as any),
      });
      paymentRepository.findOne.mockResolvedValue({ id: 'pay-1', amount: '400.00', reference: 'REF-1' });
      const replay = await service.create(body as any, 'u1', undefined, 'form-abc12345');
      expect(replay.id).toBe('pay-1');
      expect(paymentRepository.save).not.toHaveBeenCalled();
      expect(commandRepo.insert).not.toHaveBeenCalled();
    });

    it('refuses the same client key with different details', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      commandRepo.findOne.mockResolvedValue({
        command_key: 'client:u1:form-abc12345',
        payment_id: 'pay-1',
        payload_hash: 'hash-of-something-else',
      });
      paymentRepository.findOne.mockResolvedValue({ id: 'pay-1', amount: '400.00', reference: 'REF-1', created_at: new Date() });
      await expect(
        service.create(dto({ amount: 450 }) as any, 'u1', undefined, 'form-abc12345'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets a command whose payment was deleted be used again', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      commandRepo.findOne.mockResolvedValue({
        command_key: 'natural:inv-1:ref-1',
        payment_id: null,
        payload_hash: 'old',
      });
      await expect(service.create(dto() as any, 'u1')).resolves.toBeDefined();
      expect(commandRepo.save).toHaveBeenCalledWith(expect.objectContaining({ payment_id: null }));
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('generates a reference when none was sent and still claims the command', async () => {
      invoicesService.findOne.mockResolvedValue(invoice());
      jest
        .spyOn(service as any, 'generatePaymentReference')
        .mockResolvedValue('PAY-2026-0001');
      await service.create(dto({ reference: undefined }) as any, 'u1');
      expect(commandRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ command_key: 'natural:inv-1:pay-2026-0001' }),
      );
    });

    it('a rep cannot pay against another rep invoice (404, unchanged)', async () => {
      invoicesService.findOne.mockResolvedValue(invoice({ owner_id: 'rep-2' }));
      await expect(service.create(dto() as any, 'u1', 'rep-1')).rejects.toThrow(/not found/);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      // The payment is read twice inside the transaction: once to find its
      // invoice, once locked after the invoice family is locked.
      paymentRepository.findOne.mockResolvedValue({
        id: 'pay-1',
        invoice_id: 'inv-1',
        amount: '400.00',
      });
      paymentRepository.save.mockImplementation(async (p: any) => p);
      invoicesService.findOne.mockResolvedValue(invoice());
    });

    it('refuses raising a payment past the balance, ignoring its own old amount', async () => {
      // 400 (this payment) + 500 (others) received; others alone = 500,
      // so this payment may go up to 500, not 700.
      qb.getRawOne.mockResolvedValue({ received: '500.00' });
      await expect(service.update('pay-1', { amount: 700 } as any, 'u1')).rejects.toThrow(
        /exceeds the 500\.00 still owed/,
      );
      expect(qb.andWhere).toHaveBeenCalledWith('payment.id != :excludePaymentId', {
        excludePaymentId: 'pay-1',
      });
    });

    it('allows raising a payment up to the balance', async () => {
      qb.getRawOne.mockResolvedValue({ received: '500.00' });
      await expect(service.update('pay-1', { amount: 500 } as any, 'u1')).resolves.toBeDefined();
      expect(paymentTermsService.reversePaymentAllocations).toHaveBeenCalledWith('pay-1', manager);
    });

    it('does not re-check the balance when the amount is unchanged', async () => {
      await service.update('pay-1', { notes: 'late' } as any, 'u1');
      expect(qb.getRawOne).not.toHaveBeenCalled();
    });
  });
});
