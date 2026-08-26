import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import Mustache from 'mustache';
import { EmailTemplate } from '../entities/email-template.entity';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from '../dto/email-template.dto';
import {
  MergeVarContextService,
  MergeVarScope,
} from './merge-var-context.service';

export interface RenderedEmail {
  subject: string;
  body_html: string;
  body_text: string;
}

/**
 * CRUD + render layer for re-usable email templates. Renders use
 * Mustache so the syntax matches the existing notifications template
 * engine (see `notifications/templates/template.engine.ts`) — authors
 * learn one language, not two.
 */
@Injectable()
export class EmailTemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly repo: Repository<EmailTemplate>,
    private readonly mergeVars: MergeVarContextService,
  ) {}

  /**
   * List templates visible to `userId` — both that user's personal
   * templates and organisation-wide templates (owner_user_id = NULL).
   */
  async listForUser(userId: string): Promise<EmailTemplate[]> {
    return this.repo.find({
      where: [
        { owner_user_id: userId, is_active: true },
        { owner_user_id: IsNull(), is_active: true } as object,
      ] as object,
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, userId: string): Promise<EmailTemplate> {
    const tpl = await this.repo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`Template ${id} not found`);
    // Private templates are not readable by anyone except the owner.
    if (tpl.owner_user_id && tpl.owner_user_id !== userId) {
      throw new ForbiddenException(
        'You do not have access to this template',
      );
    }
    return tpl;
  }

  async create(
    dto: CreateEmailTemplateDto,
    userId: string,
    isAdmin: boolean,
  ): Promise<EmailTemplate> {
    // Only admins can create org-wide templates.  For non-admins we
    // silently force ownership to themselves — a malicious payload
    // can't create a shared template by flipping `is_shared`.
    const ownerUserId = dto.is_shared && isAdmin ? null : userId;

    const existing = await this.repo.findOne({
      where: ownerUserId
        ? { slug: dto.slug, owner_user_id: ownerUserId }
        : { slug: dto.slug, owner_user_id: IsNull() },
    });
    if (existing) {
      throw new BadRequestException(
        `A template with slug "${dto.slug}" already exists in this scope`,
      );
    }

    // Validate the template compiles before we persist — authors get
    // an immediate error instead of silently saving a broken template.
    try {
      Mustache.parse(dto.subject);
      Mustache.parse(dto.body_html);
      if (dto.body_text) Mustache.parse(dto.body_text);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Template parse error';
      throw new BadRequestException(`Template syntax error: ${message}`);
    }

    const entity = this.repo.create({
      slug: dto.slug,
      name: dto.name,
      subject: dto.subject,
      body_html: dto.body_html,
      body_text: dto.body_text ?? null,
      variables: dto.variables ?? null,
      category: dto.category ?? null,
      owner_user_id: ownerUserId as string | null,
      is_active: true,
    });
    return this.repo.save(entity);
  }

  async update(
    id: string,
    dto: UpdateEmailTemplateDto,
    userId: string,
    isAdmin: boolean,
  ): Promise<EmailTemplate> {
    const tpl = await this.findOne(id, userId);

    // Only admins can edit shared templates.
    if (!tpl.owner_user_id && !isAdmin) {
      throw new ForbiddenException(
        'Only admins can edit organisation-wide templates',
      );
    }

    Object.assign(tpl, {
      slug: dto.slug ?? tpl.slug,
      name: dto.name ?? tpl.name,
      subject: dto.subject ?? tpl.subject,
      body_html: dto.body_html ?? tpl.body_html,
      body_text: dto.body_text ?? tpl.body_text,
      variables: dto.variables ?? tpl.variables,
      category: dto.category ?? tpl.category,
      is_active: dto.is_active ?? tpl.is_active,
    });

    return this.repo.save(tpl);
  }

  async remove(id: string, userId: string, isAdmin: boolean): Promise<void> {
    const tpl = await this.findOne(id, userId);
    if (!tpl.owner_user_id && !isAdmin) {
      throw new ForbiddenException(
        'Only admins can delete organisation-wide templates',
      );
    }
    await this.repo.remove(tpl);
  }

  /**
   * Render a template using the merge-var scope for the given
   * (contact / lead / deal / sender) tuple.  Safe escaping is on by
   * default for HTML; the subject and plain-text bodies skip escaping
   * since they don't go through an HTML parser.
   */
  async render(
    id: string,
    userId: string,
    ctx: {
      senderUserId: string;
      leadId?: string;
      dealId?: string;
      contactId?: string;
      scopeUserId?: string;
    },
  ): Promise<RenderedEmail> {
    const tpl = await this.findOne(id, userId);
    const scope: MergeVarScope = await this.mergeVars.buildScope(ctx);

    const subject = Mustache.render(
      tpl.subject,
      scope,
      {},
      { escape: (v: unknown) => String(v ?? '') },
    );
    const body_html = Mustache.render(tpl.body_html, scope);
    const body_text = tpl.body_text
      ? Mustache.render(
          tpl.body_text,
          scope,
          {},
          { escape: (v: unknown) => String(v ?? '') },
        )
      : // Cheap fallback: strip tags from the rendered HTML.
        Mustache.render(tpl.body_html, scope).replace(/<[^>]+>/g, '');

    return { subject, body_html, body_text };
  }
}
