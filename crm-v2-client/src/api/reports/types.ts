export type SalesPerformancePeriod = "month" | "quarter" | "year";

export interface SalesPerformanceStats {
  totalPrincipalSold: number;
  totalContractValue: number;
  cashCollected: number;
  outstanding: number;
}

export interface PipelineStageStats {
  stageName: string;
  stageColor: string;
  dealCount: number;
  totalValue: number;
  avgDaysInStage: number;
}

export interface FinanceRevenueByMethod {
  method: string;
  amount: number;
}

export interface FinanceOutstandingInvoice {
  id: string;
  invoiceNumber: string;
  schoolName: string;
  amountDue: number;
  amountPaid: number;
  status: string;
}

export interface FinanceUpcomingInstallment {
  id: string;
  dealName: string;
  amount: number;
  dueDate: string;
  status: string;
}

export interface FinanceReportStats {
  revenueByMethod: FinanceRevenueByMethod[];
  outstandingInvoices: FinanceOutstandingInvoice[];
  upcomingInstallments: FinanceUpcomingInstallment[];
}
