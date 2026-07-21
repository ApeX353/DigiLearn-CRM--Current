import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { Lead } from './entities/lead.entity';
import { LeadSLA } from './entities/lead-sla.entity';
import { LeadSLAHistory } from './entities/lead-sla-history.entity';
import { LeadQualificationCriteria } from './entities/lead-qualification-criteria.entity';
import { LeadSLAService } from './services/lead-sla.service';
import { LeadQualificationService } from './services/lead-qualification.service';
import { LeadSLAController } from './lead-sla.controller';
import { LeadQualificationController } from './lead-qualification.controller';
import { LeadReversalRequestsController } from './lead-reversal-requests.controller';
import { CanAccessLeadGuard } from './guards/can-access-lead.guard';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { LeadStakeholder } from './entities/lead-stakeholders.entity';
import { School } from '../schools/entities/schools.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { User } from '../users/entities/user.entity';
import { LeadReversalRequest } from './entities/lead-reversal-request.entity';
import { EmailSequencesModule } from '../email-sequences/email-sequences.module';
import { LeadTemperatureService } from './services/lead-temperature.service';
import { Activity } from '../activities/entities/activity.entity';
import { LeadEscalation } from './entities/lead-escalation.entity';
import { LeadEscalationService } from './services/lead-escalation.service';
import { LeadEscalationsController } from './lead-escalations.controller';
import { DuplicateSuspicion } from './entities/duplicate-suspicion.entity';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { DuplicatesController } from './duplicates.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead,
      LeadSLA,
      LeadSLAHistory,
      LeadStakeholder,
      LeadReversalRequest,
      LeadQualificationCriteria,
      LeadEscalation,
      DuplicateSuspicion,
      School,
      Contact,
      User,
      Activity,
    ]),
    forwardRef(() => AuthModule),
    ActivityLogsModule,
    forwardRef(() => EmailSequencesModule),
    SettingsModule,
  ],
  controllers: [
    LeadsController,
    LeadReversalRequestsController,
    LeadSLAController,
    LeadQualificationController,
    LeadEscalationsController,
    DuplicatesController,
  ],
  providers: [
    LeadsService,
    LeadSLAService,
    LeadQualificationService,
    CanAccessLeadGuard,
    LeadTemperatureService,
    LeadEscalationService,
    DuplicateDetectionService,
  ],
  exports: [
    LeadsService,
    LeadSLAService,
    LeadQualificationService,
    LeadTemperatureService,
    LeadEscalationService,
    DuplicateDetectionService,
  ],
})
export class LeadsModule {}
