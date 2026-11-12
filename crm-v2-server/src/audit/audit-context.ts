import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContext {
  userId: string | null;
  ipAddress: string | null;
}

export const auditStorage = new AsyncLocalStorage<AuditContext>();

export function getAuditContext(): AuditContext {
  return auditStorage.getStore() || { userId: null, ipAddress: null };
}
