export interface SlaApiResponse<TData> {
  success: boolean;
  message?: string;
  data: TData;
}

export interface LeadBreachSummaryLead {
  id: string;
  lead_name: string;
  status: string;
  assigned_to: string | null;
  assignee_name: string | null;
  sla_breach_count: number;
  sla_due_date: string | null;
}

export interface LeadBreachSummary {
  totalBreached: number;
  leads: LeadBreachSummaryLead[];
}

export interface DealBreachSummaryDeal {
  id: string;
  title: string;
  stage_name: string;
  assigned_to: string | null;
  assignee_name: string | null;
  sla_days: number;
  currentStageSince: string | null;
  deadline: string | null;
  daysOverdue: number;
}

export interface DealBreachSummary {
  totalBreached: number;
  deals: DealBreachSummaryDeal[];
}

export interface SlaCheckLeadBreachesLead {
  id: string;
  lead_name: string;
  status: string;
  assigned_to: string | null;
  sla_hours: number;
  sla_due_date: string | null;
}

export interface SlaCheckLeadBreachesData {
  breachedCount: number;
  leads: SlaCheckLeadBreachesLead[];
}

export interface SlaCheckDealBreachesDeal {
  id: string;
  title: string;
  stage_name: string;
  assigned_to: string | null;
  sla_days: number;
  currentStageSince: string | null;
  deadline: string | null;
}

export interface SlaCheckDealBreachesData {
  breachedCount: number;
  deals: SlaCheckDealBreachesDeal[];
}
