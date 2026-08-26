import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserEmailAccountsService } from './services/user-email-accounts.service';
import { UserEmailSenderService } from './services/user-email-sender.service';
import { EmailTemplatesService } from './services/email-templates.service';
import {
  CreateSmtpAccountDto,
  SendTestEmailDto,
  SendUserEmailDto,
  SendWithTemplateDto,
  UpdateUserEmailAccountDto,
} from './dto/user-email-account.dto';

/**
 * Owns user-email account management (`/user-email/accounts/*`) and
 * the "send as me" endpoints (`/user-email/send*`).
 *
 * Access: any sales role can manage their *own* accounts; the service
 * is responsible for ownership checks (so we can't be defeated by a
 * crafted `:id` path param). Admins have no special privileges here —
 * an admin's sending credentials are private to them.
 */
@ApiTags('User Email')
@ApiBearerAuth()
@Controller('user-email')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserEmailAccountsController {
  constructor(
    private readonly accounts: UserEmailAccountsService,
    private readonly sender: UserEmailSenderService,
    private readonly templates: EmailTemplatesService,
  ) {}

  @Get('accounts')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: "List the caller's sending accounts" })
  async list(@CurrentUser('id') userId: string) {
    const data = await this.accounts.listForUser(userId);
    return { success: true, data };
  }

  @Post('accounts/smtp')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Connect an SMTP sending account',
    description:
      'Credentials are encrypted at rest with AES-256-GCM. Set USER_EMAIL_CREDENTIALS_KEY in prod.',
  })
  async createSmtp(
    @Body() dto: CreateSmtpAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.accounts.createSmtp(userId, dto);
    return {
      success: true,
      message: 'Email account connected',
      data,
    };
  }

  @Patch('accounts/:id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiParam({ name: 'id', description: 'Email account UUID' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserEmailAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.accounts.update(id, userId, dto);
    return { success: true, message: 'Account updated', data };
  }

  @Delete('accounts/:id')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiParam({ name: 'id', description: 'Email account UUID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Account disconnected' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.accounts.remove(id, userId);
    return { success: true, message: 'Email account disconnected' };
  }

  @Post('accounts/:id/verify')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Verify SMTP connectivity',
    description:
      "Opens an SMTP session and runs transporter.verify(). Doesn't actually send mail.",
  })
  @ApiParam({ name: 'id', description: 'Email account UUID' })
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.accounts.verify(id, userId);
    return { success: data.ok, data };
  }

  @Post('accounts/:id/test-send')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Send a test email to confirm the account actually delivers',
  })
  @ApiParam({ name: 'id', description: 'Email account UUID' })
  async testSend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendTestEmailDto,
    @CurrentUser('id') userId: string,
  ) {
    const acct = await this.accounts.getOwned(id, userId);
    const target = dto.to ?? acct.email_address;
    const result = await this.sender.send({
      userId,
      accountId: id,
      to: [target],
      subject: 'CRM test email',
      body_html: `<p>This is a test from your CRM account <strong>${acct.email_address}</strong>. If you received it, your SMTP configuration works.</p>`,
      body_text: `This is a test from your CRM account ${acct.email_address}.`,
    });
    return {
      success: true,
      message: `Test email sent to ${target}`,
      data: result,
    };
  }

  @Post('send')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({ summary: 'Send a composed email through the user account' })
  async send(
    @Body() dto: SendUserEmailDto,
    @CurrentUser('id') userId: string,
  ) {
    if (!dto.body_html?.trim()) {
      throw new BadRequestException('body_html is required');
    }
    const data = await this.sender.send({
      userId,
      accountId: dto.account_id,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: dto.subject,
      body_html: dto.body_html,
      body_text: dto.body_text,
    });
    return { success: true, message: 'Email sent', data };
  }

  @Post('send/template')
  @Roles('admin', 'sales_manager', 'sales_rep')
  @ApiOperation({
    summary: 'Render + send a saved template in one call',
    description:
      'The server renders the template against the given entity context, then sends — so the email the recipient sees matches exactly what the preview shows.',
  })
  async sendTemplate(
    @Body() dto: SendWithTemplateDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    // H-05: a rep can only render+send against their own lead/deal.
    const scopeUserId = role === 'sales_rep' ? userId : undefined;
    const rendered = await this.templates.render(dto.template_id, userId, {
      senderUserId: userId,
      leadId: dto.lead_id,
      dealId: dto.deal_id,
      contactId: dto.contact_id,
      scopeUserId,
    });

    const data = await this.sender.send({
      userId,
      accountId: dto.account_id,
      to: dto.to,
      cc: dto.cc,
      bcc: dto.bcc,
      subject: rendered.subject,
      body_html: rendered.body_html,
      body_text: rendered.body_text,
    });

    return {
      success: true,
      message: 'Email sent',
      data: { ...data, rendered },
    };
  }
}
