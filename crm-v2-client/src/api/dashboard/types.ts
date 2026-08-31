import type { ActivityType } from "../activities";
import type { LeadStatus } from "../leads";

// Dashboard filter types
export type DateRangeType =
  | "today"
  | "wtd"
  | "mtd"
  | "qtd"
  | "ytd"
  | "custom";

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
  /** The configured MONTHLY target. Use for pipeline coverage / funnel health. */
  monthlyTarget: number;
  /**
   * The monthly target pro-rated to the selected date filter. Use this for
   * "cash collected vs target" — comparing one day's cash against a whole
   * month's target reads as 0% every morning and tells nobody anything.
   * Optional so an older server that does not send it still renders.
   */
  windowTarget?: number;
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
  /** Future meeting activities with 'demo' in subject, not yet completed. */
  upcomingDemos: number;
  /** Meeting activities with 'demo' in subject that completed in period. */
  completedDemos: number;
  /** Of deals whose demo completed in period, % that moved past demo stage. */
  demoToProposalRate: number;
  /** Count of deals currently sitting in a demo-named stage. */
  dealsInDemoStage?: number;
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

// Activity Discipline — one bundled payload so the manager dashboard
// renders the whole section in a single round-trip.
export interface DisciplineKpi {
  key: string;
  label: string;
  value: number;
  denom?: number;
  pct?: number;
  target?: number;
  tone: "higher-better" | "lower-better";
  hint?: string;
}

export interface ProgressionKpi {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export interface AtRiskItem {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export interface RepDisciplineRow {
  user_id: string;
  name: string;
  email: string | null;
  contacts: number;
  completed: number;
  outcome_pct: number;
  outcome_missing: number;
  next_step_pct: number;
  overdue: number;
  no_next_step_records: number;
  deals_advanced: number;
  stale_records: number;
}

export interface ActivityDisciplineData {
  window: { start: string; end: string; range: DateRangeType };
  kpis: {
    /**
     * Prospecting Discipline — first-contact metrics. Separate from
     * Volume so "Leads Contacted vs Target" can never be confused
     * with general outreach activity.
     */
    prospecting: DisciplineKpi[];
    volume: DisciplineKpi[];
    quality: DisciplineKpi[];
  };
  progression: ProgressionKpi[];
  at_risk: AtRiskItem[];
  reps: RepDisciplineRow[];
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
