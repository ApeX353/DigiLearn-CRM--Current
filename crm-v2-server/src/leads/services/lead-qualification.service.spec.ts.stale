import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LeadQualificationService } from './lead-qualification.service';
import { LeadQualificationCriteria } from '../entities/lead-qualification-criteria.entity';
import {
  CreateLeadQualificationDto,
  CompleteChecklistItemDto,
  AddChecklistItemDto,
} from '../dto';
import type { ChecklistItem } from '../interfaces';

describe('LeadQualificationService', () => {
  let service: LeadQualificationService;
  let repo: Repository<LeadQualificationCriteria>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadQualificationService,
        {
          provide: getRepositoryToken(LeadQualificationCriteria),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<LeadQualificationService>(LeadQualificationService);
    repo = module.get<Repository<LeadQualificationCriteria>>(
      getRepositoryToken(LeadQualificationCriteria),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new qualification with checklist', async () => {
      const dto: CreateLeadQualificationDto = {
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
          },
          {
            key: 'verify_budget',
            label: 'Verify budget',
            category: 'budget',
            is_required: true,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(null); // No existing qualification
      mockRepository.create.mockImplementation((data) => data);
      mockRepository.save.mockImplementation((data) => ({
        id: 'qual-123',
        ...data,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      const result = await service.create(dto, 'user-123');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { lead_id: 'lead-123' },
      });
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.lead_id).toBe('lead-123');
      expect(result.checklist_items).toHaveLength(2);
      expect(result.qualification_score).toBeGreaterThanOrEqual(0);
    });

    it('should throw ConflictException if qualification already exists', async () => {
      const dto: CreateLeadQualificationDto = {
        lead_id: 'lead-123',
      };

      mockRepository.findOne.mockResolvedValue({
        id: 'qual-123',
        lead_id: 'lead-123',
      });

      await expect(service.create(dto, 'user-123')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException for duplicate checklist keys', async () => {
      const dto: CreateLeadQualificationDto = {
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
          },
          {
            key: 'verify_email', // Duplicate key
            label: 'Verify email again',
            category: 'contact_verification',
            is_required: false,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto, 'user-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('completeChecklistItem', () => {
    it('should complete a checklist item and update score', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
          {
            key: 'verify_budget',
            label: 'Verify budget',
            category: 'budget',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
        budget_confirmed: false,
        is_qualified: false,
      };

      mockRepository.findOne.mockResolvedValue(qualification);
      mockRepository.save.mockImplementation((data) => data);

      const dto: CompleteChecklistItemDto = {
        key: 'verify_budget',
        notes: 'Budget confirmed with CFO',
      };

      const result = await service.completeChecklistItem(
        'lead-123',
        dto,
        'user-123',
      );

      expect(result.checklist_items![1].is_completed).toBe(true);
      expect(result.checklist_items![1].completed_by).toBe('user-123');
      expect(result.checklist_items![1].notes).toBe('Budget confirmed with CFO');
      expect(result.budget_confirmed).toBe(true); // BANT field updated
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if item not found', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);

      const dto: CompleteChecklistItemDto = {
        key: 'non_existent_key',
      };

      await expect(
        service.completeChecklistItem('lead-123', dto, 'user-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addChecklistItem', () => {
    it('should add a new checklist item', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);
      mockRepository.save.mockImplementation((data) => data);

      const dto: AddChecklistItemDto = {
        key: 'verify_phone',
        label: 'Verify phone number',
        category: 'contact_verification',
        is_required: true,
      };

      const result = await service.addChecklistItem('lead-123', dto);

      expect(result.checklist_items).toHaveLength(2);
      expect(result.checklist_items![1].key).toBe('verify_phone');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if item key already exists', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);

      const dto: AddChecklistItemDto = {
        key: 'verify_email', // Duplicate
        label: 'Verify email again',
        category: 'contact_verification',
        is_required: false,
      };

      await expect(service.addChecklistItem('lead-123', dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeChecklistItem', () => {
    it('should remove a non-required checklist item', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
          {
            key: 'optional_check',
            label: 'Optional check',
            category: 'needs',
            is_required: false,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);
      mockRepository.save.mockImplementation((data) => data);

      const result = await service.removeChecklistItem(
        'lead-123',
        'optional_check',
      );

      expect(result.checklist_items).toHaveLength(1);
      expect(result.checklist_items![0].key).toBe('verify_email');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when removing required item', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'verify_email',
            label: 'Verify email',
            category: 'contact_verification',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);

      await expect(
        service.removeChecklistItem('lead-123', 'verify_email'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('calculateCompletionPercentage', () => {
    it('should calculate completion percentage correctly', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'item1',
            label: 'Item 1',
            category: 'budget',
            is_required: true,
            is_completed: true,
            completed_at: new Date(),
            completed_by: 'user-123',
            notes: null,
          },
          {
            key: 'item2',
            label: 'Item 2',
            category: 'budget',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
          {
            key: 'item3',
            label: 'Item 3',
            category: 'needs',
            is_required: false,
            is_completed: true,
            completed_at: new Date(),
            completed_by: 'user-123',
            notes: null,
          },
        ],
      };

      mockRepository.findOne.mockResolvedValue(qualification);

      const result = await service.calculateCompletionPercentage('lead-123');

      expect(result.total).toBe(3);
      expect(result.completed).toBe(2);
      expect(result.percentage).toBe(67); // 2/3 * 100 = 66.67 rounded to 67
      expect(result.requiredTotal).toBe(2);
      expect(result.requiredCompleted).toBe(1);
      expect(result.requiredPercentage).toBe(50); // 1/2 * 100 = 50
    });

    it('should return zero percentages when no checklist exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: null,
      });

      const result = await service.calculateCompletionPercentage('lead-123');

      expect(result.total).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.requiredTotal).toBe(0);
      expect(result.requiredCompleted).toBe(0);
      expect(result.requiredPercentage).toBe(0);
    });
  });

  describe('updateQualificationStatus', () => {
    it('should set is_qualified to true when threshold met', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'item1',
            label: 'Item 1',
            category: 'budget',
            is_required: true,
            is_completed: true,
            completed_at: new Date(),
            completed_by: 'user-123',
            notes: null,
          },
          {
            key: 'item2',
            label: 'Item 2',
            category: 'timeline',
            is_required: true,
            is_completed: true,
            completed_at: new Date(),
            completed_by: 'user-123',
            notes: null,
          },
        ],
        is_qualified: false,
        qualified_at: null,
      };

      mockRepository.save.mockImplementation((data) => data);

      const result = await service.updateQualificationStatus(
        qualification as LeadQualificationCriteria,
      );

      expect(result.is_qualified).toBe(true);
      expect(result.qualified_at).toBeInstanceOf(Date);
      expect(result.qualification_score).toBe(100); // All required items completed
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should set is_qualified to false when threshold not met', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        checklist_items: [
          {
            key: 'item1',
            label: 'Item 1',
            category: 'budget',
            is_required: true,
            is_completed: true,
            completed_at: new Date(),
            completed_by: 'user-123',
            notes: null,
          },
          {
            key: 'item2',
            label: 'Item 2',
            category: 'timeline',
            is_required: true,
            is_completed: false,
            completed_at: null,
            completed_by: null,
            notes: null,
          },
        ],
        is_qualified: true,
        qualified_at: new Date(),
      };

      mockRepository.save.mockImplementation((data) => data);

      const result = await service.updateQualificationStatus(
        qualification as LeadQualificationCriteria,
      );

      expect(result.is_qualified).toBe(false);
      expect(result.qualified_at).toBeNull();
      expect(result.qualification_score).toBe(50); // Only 1 of 2 required items completed
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('findByLeadId', () => {
    it('should return qualification by lead ID', async () => {
      const qualification: Partial<LeadQualificationCriteria> = {
        id: 'qual-123',
        lead_id: 'lead-123',
        is_qualified: false,
      };

      mockRepository.findOne.mockResolvedValue(qualification);

      const result = await service.findByLeadId('lead-123');

      expect(result).toEqual(qualification);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { lead_id: 'lead-123' },
      });
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findByLeadId('lead-123')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
