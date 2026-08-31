import type { SelectQueryBuilder } from 'typeorm';
import { User } from '../users/entities/user.entity';

/**
 * Who belongs on a SALES scoreboard.
 *
 * Rep Discipline and the Compliance report both score "people who carry a
 * sales book". Both used to answer that with a role check alone:
 *
 *     sr.name IN ('sales_rep', 'sales_manager')
 *
 * which is wrong, because a sales role is also how someone is granted SIGHT
 * of the sales product. prince@me.com holds admin_support AND sales_manager
 * for exactly that reason -- oversight, not selling -- and was therefore
 * scored as a rep, landing in the team table and in the org averages that
 * every other rep is measured against. Both files already carried a comment
 * naming him as somebody who must not appear; neither implemented it.
 *
 * So the roster is two rules, not one:
 *   - hold a sales role, AND
 *   - do not hold an oversight role.
 *
 * TRADE-OFF, deliberate: giving a genuine seller `admin` or `admin_support`
 * removes them from their own scoreboard. That is the documented intent
 * ("Admins, admin_support and non-sales managers must NOT appear"), and it
 * fails in the safe direction -- a missing row is noticed, a quietly skewed
 * average is not. If a real seller ever needs admin rights, take them off
 * this list explicitly rather than loosening the rule for everyone.
 */
export const SALES_ROLES = ['sales_rep', 'sales_manager'] as const;

/** Oversight roles. Holding one means you are not carrying a sales book. */
export const OVERSIGHT_ROLES = ['admin', 'admin_support'] as const;

/**
 * Narrow a User query to the sales roster: active, holds a sales role, and
 * holds no oversight role.
 *
 * Both conditions use id-IN-subquery rather than a join. A to-many join with
 * .take() makes TypeORM paginate via a distinct-id subquery whose row order
 * is undefined, and the entity transformer then hydrates `roles` as an empty
 * array for some rows -- which once silently dropped EVERYONE from the team
 * view. The subquery form has no such dependency.
 */
export function applySalesRosterFilter<T extends SelectQueryBuilder<User>>(
  qb: T,
): T {
  return excludeOversightRoles(
    qb
      .andWhere((sub) => {
        const q = sub
          .subQuery()
          .select('su.id')
          .from(User, 'su')
          .innerJoin('su.roles', 'sr')
          .where('sr.name IN (:...salesRoles)')
          .getQuery();
        return `u.id IN ${q}`;
      })
      .setParameter('salesRoles', [...SALES_ROLES]) as T,
  );
}

/**
 * Drop oversight staff from a cohort that was derived from DATA rather than
 * from roles.
 *
 * "Leads Contacted" builds its per-rep table from DISTINCT created_by_id on
 * completed contact activities, so a role filter never applied — anyone who
 * logged a call turned up as a rep. Somebody doing oversight work still
 * touches records occasionally (prince@me.com has activity rows), and each
 * one of those put him in the table and into the per-rep averages.
 */
export function excludeOversightRoles<T extends SelectQueryBuilder<User>>(
  qb: T,
): T {
  return qb
    .andWhere((sub) => {
      const q = sub
        .subQuery()
        .select('ou.id')
        .from(User, 'ou')
        .innerJoin('ou.roles', 'orl')
        .where('orl.name IN (:...oversightRoles)')
        .getQuery();
      return `u.id NOT IN ${q}`;
    })
    .setParameter('oversightRoles', [...OVERSIGHT_ROLES]) as T;
}
