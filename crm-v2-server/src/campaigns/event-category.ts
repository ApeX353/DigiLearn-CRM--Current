import { BadRequestException } from '@nestjs/common';

export const EVENT_CATEGORIES = [
  'SPEECH_PRIZE_GIVING', 'PASAF', 'NAPH', 'NASH', 'MERIT_AWARDS', 'CUSTOM',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function normalizeEventDetails(category?: string | null, customName?: string | null) {
  if (category == null) {
    if (customName?.trim()) throw new BadRequestException('Choose an event category');
    return { event_category: null, custom_event_name: null };
  }
  if (!(EVENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new BadRequestException('Invalid event category');
  }
  const name = customName?.trim().replace(/\s+/g, ' ') || null;
  if (category === 'CUSTOM' && (!name || name.length > 200)) {
    throw new BadRequestException('Custom event name must contain 1 to 200 characters');
  }
  if (category !== 'CUSTOM' && name) {
    throw new BadRequestException('Custom event name is only allowed for Custom events');
  }
  return { event_category: category as EventCategory, custom_event_name: name };
}

/** Validate the selected occurrence; never infer a campaign from its name. */
export function validateLeadEventCampaign(
  lead: { source: string; source_campaign_id?: string; event_category?: EventCategory; custom_event_name?: string },
  campaign: { event_category?: EventCategory | null; custom_event_name?: string | null } | null,
) {
  if (lead.source_campaign_id && !campaign) throw new BadRequestException('Selected campaign does not exist');
  if (!lead.event_category && !lead.custom_event_name) return normalizeEventDetails(); // Legacy intake/import compatibility.
  if (lead.source !== 'Event') throw new BadRequestException('Event details require the Event source');
  const event = normalizeEventDetails(lead.event_category, lead.custom_event_name);
  if (!event.event_category) throw new BadRequestException('Choose an event category');
  if (!lead.source_campaign_id) return event;
  if (!campaign) throw new BadRequestException('Selected campaign does not exist');
  if (campaign.event_category !== event.event_category ||
      (event.event_category === 'CUSTOM' &&
       campaign.custom_event_name?.trim().replace(/\s+/g, ' ').toLowerCase() !== event.custom_event_name?.toLowerCase())) {
    throw new BadRequestException('Selected campaign does not match the event category or name');
  }
  return event;
}
