import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEmailAccount } from './entities/user-email-account.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { Lead } from '../leads/entities/lead.entity';
import { Deal } from '../deals/entities/deal.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { EmailTemplatesService } from './services/email-templates.service';
import { MergeVarContextService } from './services/merge-var-context.service';
import { CredentialsCipher } from './services/credentials-cipher.service';
import { UserEmailAccountsService } from './services/user-email-accounts.service';
import { UserEmailSenderService } from './services/user-email-sender.service';
import { EmailTemplatesController } from './email-templates.controller';
import { UserEmailAccountsController } from './user-email-accounts.controller';

/**
 * Section 3 of the activity spec: unified per-user email accounts +
 * re-usable templates with mail-merge. This module is intentionally
 * *read-heavy* for the moment — it owns the templates + renderer, and
 * the `UserEmailAccount` entity is declared here but the send-gateway
 * lives in the notifications module (which already has providers and
 * an audit path).  Wiring the send gateway to the user account is a
 * follow-up once OAuth for Gmail/Outlook lands.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEmailAccount,
      EmailTemplate,
      Lead,
      Deal,
      Contact,
      User,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [EmailTemplatesController, UserEmailAccountsController],
  providers: [
    EmailTemplatesService,
    MergeVarContextService,
    CredentialsCipher,
    UserEmailAccountsService,
    UserEmailSenderService,
  ],
  exports: [
    EmailTemplatesService,
    MergeVarContextService,
    // Sender is exported so Section 2's cancellation-email hook and
    // Section 1's eventual "send follow-up" action can call it
    // without needing to re-wire credentials.
    UserEmailSenderService,
    UserEmailAccountsService,
    // The cipher is exported because calendar-sync stores OAuth
    // tokens with the same envelope format — one key, one algorithm
    // across the whole app.
    CredentialsCipher,
  ],
})
export class UserEmailModule {}
