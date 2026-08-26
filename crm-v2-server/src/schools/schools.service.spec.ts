import { Test, TestingModule } from '@nestjs/testing';
import { SchoolsService } from './schools.service';

const mockProvider = () => ({});

describe('SchoolsService', () => {
  let service: SchoolsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchoolsService],
    })
      .useMocker(mockProvider)
      .compile();

    service = module.get<SchoolsService>(SchoolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
