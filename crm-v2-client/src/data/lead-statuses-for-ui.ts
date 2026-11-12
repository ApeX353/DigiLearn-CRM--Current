import type { LeadStatus } from "~/api/leads";

export const leadStatuses: {name: LeadStatus, color: string}[]  = [
    { name: "New", color: "bg-blue-500" },
    { name: "Contacted", color: "bg-purple-500" },
    { name: "Qualified", color: "bg-green-500" },
    { name: "Nurture", color: "bg-amber-500" },
    { name: "Disqualified", color: "bg-cyan-500" },
    { name: "Converted", color: "bg-emerald-500" },
  ];