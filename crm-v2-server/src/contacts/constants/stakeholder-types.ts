/**
 * Stakeholder categories — how an influential person relates to the
 * company, independent of whether they're also a sales lead.
 *
 *   A `Contact` can be BOTH a sales lead AND a stakeholder (e.g. a
 *   school's Head who is also a decision maker on the purchase), or
 *   just a stakeholder (Permanent Secretary, board chair, donor rep)
 *   who never enters the pipeline but must appear in relationship
 *   history. The `is_sales_lead` flag on the Contact row distinguishes
 *   these two lives.
 *
 * Keep aligned with the frontend `STAKEHOLDER_TYPES` constant.
 */
export const STAKEHOLDER_TYPES = [
  'LeadContact',
  'SchoolStakeholder',
  'GovernmentStakeholder',
  'Partner',
  'Influencer',
  'Referrer',
  'DecisionMaker',
  'Gatekeeper',
  'Other',
] as const;

export type StakeholderType = (typeof STAKEHOLDER_TYPES)[number];
