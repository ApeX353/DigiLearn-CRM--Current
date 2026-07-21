import type { ActivityType } from "../activities";
import type { LeadStatus } from "../leads";

// Dashboard filter types
export type DateRangeType = "today" | "mtd" | "qtd" | "ytd" | "custom";

export interface DashboardFilters {
  dateRange: DateRangeType;
  salesRepId?: string;
  province?: string;
  productCategory?: string;
  customStartDate?: Date;
  customEndDate?: Date;
}

// Executive KPIs
export interface ExecutiveKPIs {
  cashCollected: number;
  principalSold: number;
  pipelineCoverageRatio: number;
  overdueAmount: number;
  pipelineValue: number;
  monthlyTarget: number;
  qualification: {
    totalLeads: number;
    qualifiedLeads: number;
    averageScore: number;
  };
}

// Leads Contacted Stats
export interface LeadsContactedStats {
  today: number;
  target: number;
  mtdAverage: number;
  missedDays: number;
  byRep: Array<{
    repId: string;
    repName: string;
    today: number;
    target: number;
    mtdTotal: number;
    mtdAverage: number;
  }>;
}

// Collections Due
export interface CollectionsDue {
  dueToday: number;
  overdue: number;
  dueIn7Days: number;
  dueIn30Days: number;
  overdueList: {
    daysOverdue: number;
    id: string;
    invoiceNumber: string;
    schoolName: string;
    dueDate: string;
    outstanding: number;
  }[];
}

// Sales Metrics
export interface SalesMetrics {
  previousPeriod: {
    principalSold: number;
    totalContractValue: number;
    cashCollected: number;
  };
  principalSold: number;
  totalContractValue: number;
  cashCollected: number;
}

// Demo Stats
export interface DemoStats {
  upcomingDemos: number;
  completedDemos: number;
  demoToProposalRate: number;
  demoDeals: {
    id: string;
    dealName: string;
    schoolName: string;
    scheduledDate: string | null;
    stageName: string;
    ownerName: string;
  }[];
}

// High Value Deals
export interface HighValueDeal {
  id: string;
  dealName: string;
  schoolName: string;
  totalContractValue: number;
  stageName: string;
  ownerName: string;
  daysInStage: number;
  slaDays: number;
  isBreached: boolean;
}

// Funnel Health
export interface FunnelHealth {
  monthlyTarget: number;
  expectedWinRate: number;
  requiredPipeline: number;
  actualPipeline: number;
  coverageRatio: number;
  stageBreakdown: {
    stageName: string;
    stageColor: string;
    dealCount: number;
    value: number;
    lostCount: number;
    lostValue: number;
  }[];
}

// Top Performing Products
export interface TopPerformingProductsData {
  products: Array<{
    product_id: string;
    product_name: string;
    totalCount: number;
    totalAmount: number;
    byRep: Array<{
      name: string;
      count: number;
      value: number;
    }>;
  }>;
}

// Schools Bought
export interface SchoolsBoughtData {
  total: number;
    newSchools: number;
    repeatSchools: number;
    byProvince: Record<string, number>;
}

// TODO - to fix this and match up the correct server response
// { stage: LeadStatus, count: number }
// Lead Pipeline Stats
export interface LeadsByStageData {
 stage: LeadStatus;
 count: number;
}

// SLA Compliance
export interface SLAComplianceData {
  onTrack: number;
  atRisk: number;
  breached: number;
  total: number;
  complianceRate: number; // percentage
  breachedLeads: Array<{
    id: string;
    leadName: string;
    stage: string;
    daysOverdue: number;
  }>;
}

// Lead Conversion
export interface LeadConversionData {
  totalLeads: number;
  converted: number;
  disqualified: number;
  active: number;
  conversionRate: number; // percentage
  avgDaysToConvert: number;
}

// Nurture Follow-ups
export interface NurtureFollowUpsData {
  overdueCount: number;
    dueToday: number;
    dueIn7Days: number;
    overdueActivities: {
        id: string;
        type: ActivityType;
        subject: string;
        leadName: string | null;
        assigneeName: string;
        dueAt: string | null;
        daysOverdue: number;
    }[];
}

// Qualification Overview
export interface QualificationOverviewData {
  total: number;
  qualified: number;
  averageScore: number;
  criteriaBreakdown: {
    withNeeds: number;
    withPlanType: number;
    withTimeline: number;
    withBudget: number;
    withContact: number;
  };
  scoreDistribution: {
    bucket: string;
    count: number;
  }[];
  topNeeds: {
    name: string;
    count: number;
    totalValue: number;
  }[];
}
