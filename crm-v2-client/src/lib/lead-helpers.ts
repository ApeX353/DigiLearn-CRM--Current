import type { LeadStakeholder } from "~/api/leads";

export function checkStakeholderCoverage(stakeholders: LeadStakeholder[]) {
  const allRoles = stakeholders.flatMap(s => s.role);
  
  const hasApprover = stakeholders.some(
    s => s.decision_role === 'decision_maker' && 
    (s.role.includes('Head') || s.role.includes('Bursar'))
  );
  
  const hasHead = allRoles.includes('Head');
  const hasBursar = allRoles.includes('Bursar');
  const hasSDCChair = allRoles.includes('SDC Chair');
  const hasICT = allRoles.includes('ICT Coordinator');
  const hasTeacher = allRoles.includes('Teacher');
  const hasProcurement = allRoles.includes('Procurement');
  
  const hasRequiredApprover = hasHead || hasBursar;
  const otherRolesCount = [hasSDCChair, hasICT, hasTeacher, hasProcurement].filter(Boolean).length;
  
  // For MVD: Just need Head OR Bursar to proceed (simplified)
  // The original complex logic required 2+ roles/stakeholders which was too strict
  const isQualified = hasRequiredApprover;
  
  return {
    hasHead,
    hasBursar,
    hasSDCChair,
    hasICT,
    hasTeacher,
    hasProcurement,
    hasApprover,
    hasRequiredApprover,
    otherRolesCount,
    isQualified,
  };
}
