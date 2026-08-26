import { handleApiError } from "~/api/axios";

export interface BlockedActionMessage {
  title: string;
  description: string;
  missingItems: string[];
}

export const LEAD_MVD_REQUIREMENTS = [
  "School name",
  "Contact person",
  "Phone, WhatsApp, or email",
  "Decision-maker status",
  "Interest or need",
  "Budget or payment plan",
  "Boards or products required",
  "Timeline",
  "Future next action",
] as const;

const LEAD_MVD_PREFIX =
  "Cannot qualify lead until Minimum Viable Data is complete:";

const normalizeItem = (value: string) => {
  const trimmed = value.trim().replace(/\.$/, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

function splitMissingItems(message: string, prefix: string): string[] {
  if (!message.toLowerCase().startsWith(prefix.toLowerCase())) return [];
  return message
    .slice(prefix.length)
    .split(/[;,]/)
    .map(normalizeItem)
    .filter(Boolean);
}

export function formatLeadQualificationBlock(error: unknown): BlockedActionMessage {
  const message = handleApiError(error);
  const missingItems = splitMissingItems(message, LEAD_MVD_PREFIX);

  if (missingItems.length > 0) {
    return {
      title: "Lead cannot be qualified yet",
      description:
        "Complete the missing Minimum Viable Data fields and make sure a future next action is scheduled.",
      missingItems,
    };
  }

  return {
    title: "Lead cannot be qualified yet",
    description: message,
    missingItems: [],
  };
}

export function formatDealStageBlock(
  error: unknown,
  targetStageName?: string,
): BlockedActionMessage {
  const message = handleApiError(error);
  const lower = message.toLowerCase();
  const missingItems: string[] = [];

  if (lower.includes("skip")) {
    missingItems.push("Move through the next required intermediate stage first");
  }
  if (lower.includes("rollback")) {
    missingItems.push("Submit a rollback request for manager approval");
  }
  if (lower.includes("demo") && lower.includes("schedule")) {
    missingItems.push("Schedule a demo meeting on this lead or deal");
  }
  if (lower.includes("demo") && lower.includes("complete")) {
    missingItems.push("Complete the demo meeting and record its outcome");
  }
  if (lower.includes("quotation") || lower.includes("proposal")) {
    missingItems.push("Send or record quotation/proposal evidence");
  }
  if (lower.includes("po") || lower.includes("purchase order")) {
    missingItems.push("Mark the related quotation as PO received");
  }
  if (lower.includes("accepted quotation") || lower.includes("accepted quote")) {
    missingItems.push("Record an accepted quotation or PO evidence");
  }
  if (lower.includes("lost reason") || lower.includes("transition note")) {
    missingItems.push("Add a lost reason or transition note");
  }

  return {
    title: targetStageName
      ? `Cannot move to ${targetStageName}`
      : "Stage move blocked",
    description:
      missingItems.length > 0
        ? "The current stage was preserved. Add the required evidence, then try the move again."
        : message,
    missingItems,
  };
}
