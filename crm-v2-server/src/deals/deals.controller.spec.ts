import { Test, TestingModule } from '@nestjs/testing';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

const mockProvider = () => ({});

describe('DealsController', () => {
  let controller: DealsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DealsController],
      providers: [DealsService],
    })
      .useMocker(mockProvider)
      .compile();

    controller = module.get<DealsController>(DealsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
