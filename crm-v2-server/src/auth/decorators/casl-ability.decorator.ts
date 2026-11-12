import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to get the CASL ability instance from the request.
 * The ability is attached by RolesGuard after building it for the current user.
 *
 * Use with `subject()` from `@casl/ability` for entity-level permission checks:
 * @example
 * import { subject } from '@casl/ability';
 *
 * @Get(':id')
 * @CheckPermission('read', 'Deal')
 * findOne(
 *   @Param('id') id: string,
 *   @CaslAbility() ability: AppAbility,
 * ) {
 *   const deal = await this.dealsService.findDealDetails(id);
 *   if (!ability.can(Action.READ, subject('Deal', deal))) {
 *     throw new ForbiddenException('Access denied');
 *   }
 *   return deal;
 * }
 */
export const CaslAbility = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.ability;
  },
);
