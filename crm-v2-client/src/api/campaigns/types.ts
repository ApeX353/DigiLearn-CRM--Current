export const CAMPAIGN_TYPES = ["CONFERENCE", "ROADSHOW", "OTHER"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  CONFERENCE: "Conference",
  ROADSHOW: "Roadshow",
  OTHER: "Other",
};

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  start_date: string;
  end_date: string | null;
  entry_date: string;
  currency: string;
  created_by_id: string;
  created_by?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCampaignDto {
  name: string;
  type: CampaignType;
  start_date: string;
  end_date?: string;
  entry_date?: string;
  currency?: string;
}

export interface CampaignSpendRow {
  currency: string;
  in_approval: string;
  paid: string;
  total: string;
}

export interface CampaignLead {
  id: string;
  lead_name: string;
  status: string;
  created_at: string;
  school?: { id: string; name: string } | null;
  assignee?: { id: string; first_name: string; last_name: string } | null;
}

export interface CampaignRoiPerCurrency {
  currency: string;
  spend_paid: string;
  spend_committed: string;
  cost_per_lead: string | null;
  cost_per_won_deal: string | null;
}

export interface CampaignWonDealCost {
  deal_id: string;
  title: string;
  deal_value: string;
  deal_currency: string;
  currency: string;
  campaign_share: string;
  direct_cost: string;
  true_cost: string;
}

export interface CampaignRoi {
  campaign: {
    id: string;
    name: string;
    type: CampaignType;
    start_date: string;
    end_date: string | null;
  };
  spend: CampaignSpendRow[];
  leads_sourced: number;
  won_deals: number;
  per_currency: CampaignRoiPerCurrency[];
  won_deal_costs: CampaignWonDealCost[];
}
