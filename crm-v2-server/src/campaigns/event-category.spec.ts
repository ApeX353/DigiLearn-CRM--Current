import { BadRequestException } from '@nestjs/common';
import { normalizeEventDetails, validateLeadEventCampaign, EVENT_CATEGORIES } from './event-category';
import { CampaignEventCategories1789000000000 } from '../database/migrations/1789000000000-CampaignEventCategories';
import { CampaignsService } from './campaigns.service';
import { CampaignType } from './entities/campaign.entity';
import { validate } from 'class-validator';
import { LeadInfoDto } from '../leads/dto/create-lead-with-school-contacts.dto';
import { DISTRICTS_BY_PROVINCE } from '../schools/constants/provinces';
import { LeadEventDetails1790000000000 } from '../database/migrations/1790000000000-LeadEventDetails';

describe('event campaign attribution', () => {
  it.each(EVENT_CATEGORIES.filter(c => c !== 'CUSTOM'))('accepts category %s without custom text', category => {
    expect(normalizeEventDetails(category)).toEqual({ event_category: category, custom_event_name: null });
  });
  it('normalizes custom names', () => {
    expect(normalizeEventDetails('CUSTOM', '  Heads   Meeting  ')).toEqual({ event_category: 'CUSTOM', custom_event_name: 'Heads Meeting' });
  });
  it.each([['CUSTOM', ' '], ['CUSTOM', 'x'.repeat(201)], ['NASH', 'text'], ['invalid', null], [null, 'name']])('rejects invalid details %s/%s', (category, name) => {
    expect(() => normalizeEventDetails(category, name)).toThrow(BadRequestException);
  });
  it('retains unclassified legacy campaigns and intake', () => {
    expect(normalizeEventDetails()).toEqual({ event_category: null, custom_event_name: null });
    expect(() => validateLeadEventCampaign({ source: 'Event' }, null)).not.toThrow();
  });
  it('accepts event details without any campaign and returns the values to persist', () => {
    expect(validateLeadEventCampaign({ source: 'Event', event_category: 'NASH' }, null)).toEqual({ event_category: 'NASH', custom_event_name: null });
    expect(validateLeadEventCampaign({ source: 'Event', event_category: 'CUSTOM', custom_event_name: ' Heads  Meeting ' }, null)).toEqual({ event_category: 'CUSTOM', custom_event_name: 'Heads Meeting' });
    expect(() => validateLeadEventCampaign({ source: 'Event', event_category: 'CUSTOM', custom_event_name: ' ' }, null)).toThrow();
  });
  it('still requires a selected campaign to exist and match', () => {
    expect(() => validateLeadEventCampaign({ source: 'Event', source_campaign_id: 'id', event_category: 'NASH' }, null)).toThrow();
    expect(() => validateLeadEventCampaign({ source: 'Event', source_campaign_id: 'id', event_category: 'NASH' }, { event_category: 'NAPH' })).toThrow();
    expect(() => validateLeadEventCampaign({ source: 'Event', source_campaign_id: 'id', event_category: 'NASH' }, { event_category: 'NASH' })).not.toThrow();
  });
  it('matches custom names case/whitespace-insensitively and rejects another event', () => {
    const input = { source: 'Event', source_campaign_id: 'id', event_category: 'CUSTOM' as const, custom_event_name: ' heads  MEETING ' };
    expect(() => validateLeadEventCampaign(input, { event_category: 'CUSTOM', custom_event_name: 'Heads Meeting' })).not.toThrow();
    expect(() => validateLeadEventCampaign(input, { event_category: 'CUSTOM', custom_event_name: 'Other Meeting' })).toThrow();
    expect(() => validateLeadEventCampaign({ ...input, source: 'Website' }, { event_category: 'CUSTOM', custom_event_name: 'Heads Meeting' })).toThrow();
  });
  it('rejects invalid campaign IDs even for legacy non-event intake', () => {
    expect(() => validateLeadEventCampaign({ source: 'Website', source_campaign_id: 'id' }, null)).toThrow();
  });
  it('DTO whitelist retains event fields and rejects invalid enum', async () => {
    const dto = Object.assign(new LeadInfoDto(), { name: 'School', source: 'Event', school_name: 'School', event_category: 'NASH', source_campaign_id: 'c1cb66ff-cebc-4104-83cb-fd561ef91adf' });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    dto.event_category = 'bad' as any;
    expect((await validate(dto)).some(e => e.property === 'event_category')).toBe(true);
  });
  it('persists and updates campaign category without changing type/dates', async () => {
    const repo = { create: jest.fn(x => x), save: jest.fn(async x => x), findOne: jest.fn(async () => null) };
    const service = new CampaignsService(repo as any, {} as any, {} as any, {} as any);
    const created = await service.create({ name: 'Heads Meeting 11 September', type: CampaignType.OTHER, start_date: '2026-09-11', end_date: '2026-09-11', entry_date: '2026-09-21', event_category: 'CUSTOM', custom_event_name: ' Heads Meeting ' }, 'actor');
    expect(created.custom_event_name).toBe('Heads Meeting');
    expect(created.entry_date).toBe('2026-09-21');
    repo.findOne.mockResolvedValue(created as never);
    const edited = await service.update('id', { event_category: 'NASH' });
    expect(edited.custom_event_name).toBeNull();
    expect(edited.start_date).toBe('2026-09-11');
    expect(edited.type).toBe(CampaignType.OTHER);
  });
  it('refuses destructive migration rollback with category data', async () => {
    const query = jest.fn().mockResolvedValue([{ count: 1 }]);
    await expect(new CampaignEventCategories1789000000000().down({ query } as any)).rejects.toThrow('Export');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('refuses dropping independently saved lead event details', async () => {
    const query = jest.fn().mockResolvedValue([{ count: 1 }]);
    await expect(new LeadEventDetails1790000000000().down({ query } as any)).rejects.toThrow('Export');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('lists exactly the five confirmed Bulawayo districts', () => {
    expect(DISTRICTS_BY_PROVINCE.Bulawayo).toEqual(['Bulawayo Central', 'Imbizo', 'Khami', 'Mzilikazi', 'Reigate']);
  });
});

