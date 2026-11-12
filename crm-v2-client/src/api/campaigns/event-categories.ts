export const EVENT_CATEGORIES = ["SPEECH_PRIZE_GIVING", "PASAF", "NAPH", "NASH", "MERIT_AWARDS", "CUSTOM"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  SPEECH_PRIZE_GIVING: "Speech and Prize Giving Day",
  PASAF: "PASAF", NAPH: "NAPH", NASH: "NASH", MERIT_AWARDS: "Merit Awards", CUSTOM: "Custom",
};
export function eventLabel(campaign: { event_category?: EventCategory | null; custom_event_name?: string | null }) {
  return campaign.event_category === "CUSTOM" ? campaign.custom_event_name || "Custom" :
    campaign.event_category ? EVENT_CATEGORY_LABELS[campaign.event_category] : "Not classified";
}
export function campaignMatchesEvent(
  campaign: { event_category?: EventCategory | null; custom_event_name?: string | null },
  category?: EventCategory, name?: string,
) {
  const normalize = (value?: string | null) => value?.trim().replace(/\s+/g, " ").toLowerCase() || "";
  return !!category && campaign.event_category === category &&
    (category !== "CUSTOM" || (!!normalize(name) && normalize(campaign.custom_event_name) === normalize(name)));
}
