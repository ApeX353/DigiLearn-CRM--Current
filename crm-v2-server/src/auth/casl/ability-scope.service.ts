import { Injectable } from '@nestjs/common';
import { subject } from '@casl/ability';
import type { SelectQueryBuilder } from 'typeorm';
import type { AppAbility } from './casl-ability.factory';
import { Action } from '../constants/permissions';

export interface AbilityScopeOptions {
  action: Action;
  subject: string;
  conditionKeyMap?: Record<string, string>;
}

export interface QueryScopeOptions extends AbilityScopeOptions {
  queryAlias: string;
}

interface SqlParamState {
  value: number;
}

@Injectable()
export class AbilityScopeService {
  hasAnyAllowRule(
    ability: AppAbility,
    action: Action,
    subjectName: string,
  ): boolean {
    return ability
      .rulesFor(action, subjectName as any)
      .some((rule) => !rule.inverted);
  }

  canAccessRecord(
    ability: AppAbility,
    record: Record<string, unknown>,
    options: AbilityScopeOptions,
  ): boolean {
    const { action, subject: subjectName, conditionKeyMap = {} } = options;

    if (ability.can(action, subject(subjectName, record as any))) {
      return true;
    }

    const rules = ability.rulesFor(action, subjectName as any);
    if (rules.length === 0) {
      return false;
    }

    let allowed = false;

    for (const rule of rules) {
      const conditions = rule.conditions as Record<string, unknown> | undefined;
      const matches = this.matchesConditions(conditions, record, conditionKeyMap);

      if (!matches) {
        continue;
      }

      if (rule.inverted) {
        return false;
      }

      allowed = true;
    }

    return allowed;
  }

  applyScopeToQueryBuilder<T extends object>(
    queryBuilder: SelectQueryBuilder<T>,
    ability: AppAbility,
    options: QueryScopeOptions,
  ): void {
    const {
      action,
      subject: subjectName,
      queryAlias,
      conditionKeyMap = {},
    } = options;

    const rules = ability.rulesFor(action, subjectName as any);
    const allowRules = rules.filter((rule) => !rule.inverted);
    const denyRules = rules.filter((rule) => rule.inverted);

    if (allowRules.length === 0) {
      queryBuilder.andWhere('1 = 0');
      return;
    }

    const hasUnconditionalAllow = allowRules.some((rule) =>
      this.isUnconditional(rule.conditions as Record<string, unknown> | undefined),
    );

    const hasUnconditionalDeny = denyRules.some((rule) =>
      this.isUnconditional(rule.conditions as Record<string, unknown> | undefined),
    );
    if (hasUnconditionalDeny) {
      queryBuilder.andWhere('1 = 0');
      return;
    }

    const params: Record<string, unknown> = {};
    const state: SqlParamState = { value: 0 };

    if (!hasUnconditionalAllow) {
      const allowClauses = allowRules
        .map((rule, index) =>
          this.buildSqlClause(
            rule.conditions as Record<string, unknown> | undefined,
            queryAlias,
            conditionKeyMap,
            params,
            `allow_${index}`,
            state,
          ),
        )
        .filter((clause): clause is string => Boolean(clause));

      if (allowClauses.length === 0) {
        queryBuilder.andWhere('1 = 0');
        return;
      }

      queryBuilder.andWhere(`(${allowClauses.join(' OR ')})`);
    }

    const denyClauses = denyRules
      .map((rule, index) =>
        this.buildSqlClause(
          rule.conditions as Record<string, unknown> | undefined,
          queryAlias,
          conditionKeyMap,
          params,
          `deny_${index}`,
          state,
        ),
      )
      .filter((clause): clause is string => Boolean(clause));

    if (denyClauses.length > 0) {
      queryBuilder.andWhere(`NOT (${denyClauses.join(' OR ')})`);
    }

    if (Object.keys(params).length > 0) {
      queryBuilder.setParameters(params);
    }
  }

  private isUnconditional(conditions: Record<string, unknown> | undefined): boolean {
    return !conditions || Object.keys(conditions).length === 0;
  }

  private matchesConditions(
    conditions: Record<string, unknown> | undefined,
    record: Record<string, unknown>,
    conditionKeyMap: Record<string, string>,
  ): boolean {
    if (this.isUnconditional(conditions)) {
      return true;
    }

    if (!conditions) {
      return true;
    }

    const andConditions = conditions.$and;
    if (Array.isArray(andConditions)) {
      return andConditions.every((entry) =>
        this.matchesConditions(
          (entry ?? {}) as Record<string, unknown>,
          record,
          conditionKeyMap,
        ),
      );
    }

    const orConditions = conditions.$or;
    if (Array.isArray(orConditions)) {
      return orConditions.some((entry) =>
        this.matchesConditions(
          (entry ?? {}) as Record<string, unknown>,
          record,
          conditionKeyMap,
        ),
      );
    }

    for (const [rawKey, expectedValue] of Object.entries(conditions)) {
      if (rawKey === '$and' || rawKey === '$or') {
        continue;
      }

      const mappedKey = conditionKeyMap[rawKey] ?? rawKey;
      const actualValue = record[mappedKey] ?? record[rawKey];

      if (!this.matchesValue(actualValue, expectedValue)) {
        return false;
      }
    }

    return true;
  }

  private matchesValue(actualValue: unknown, expectedValue: unknown): boolean {
    if (expectedValue === null) {
      return actualValue === null || typeof actualValue === 'undefined';
    }

    if (Array.isArray(expectedValue)) {
      return expectedValue.some((value) => this.valuesEqual(actualValue, value));
    }

    if (
      typeof expectedValue === 'object' &&
      expectedValue !== null &&
      !(expectedValue instanceof Date)
    ) {
      const operators = expectedValue as Record<string, unknown>;
      const operatorKeys = Object.keys(operators);
      if (operatorKeys.length === 0) {
        return false;
      }

      for (const operator of operatorKeys) {
        if (!this.matchesOperator(operator, actualValue, operators[operator])) {
          return false;
        }
      }

      return true;
    }

    return this.valuesEqual(actualValue, expectedValue);
  }

  private matchesOperator(
    operator: string,
    actualValue: unknown,
    operand: unknown,
  ): boolean {
    switch (operator) {
      case '$eq':
        return this.valuesEqual(actualValue, operand);
      case '$ne':
        return !this.valuesEqual(actualValue, operand);
      case '$in':
        return Array.isArray(operand)
          ? operand.some((value) => this.valuesEqual(actualValue, value))
          : false;
      case '$nin':
        return Array.isArray(operand)
          ? !operand.some((value) => this.valuesEqual(actualValue, value))
          : false;
      case '$exists': {
        const shouldExist = Boolean(operand);
        return shouldExist
          ? actualValue !== null && typeof actualValue !== 'undefined'
          : actualValue === null || typeof actualValue === 'undefined';
      }
      default:
        return false;
    }
  }

  private valuesEqual(left: unknown, right: unknown): boolean {
    if (typeof left === 'string' && typeof right === 'string') {
      return left.trim().toLowerCase() === right.trim().toLowerCase();
    }

    if (left instanceof Date && right instanceof Date) {
      return left.getTime() === right.getTime();
    }

    return left === right;
  }

  private buildSqlClause(
    conditions: Record<string, unknown> | undefined,
    queryAlias: string,
    conditionKeyMap: Record<string, string>,
    params: Record<string, unknown>,
    prefix: string,
    state: SqlParamState,
  ): string | null {
    if (this.isUnconditional(conditions) || !conditions) {
      return null;
    }

    const fragments: string[] = [];

    for (const [rawKey, rawValue] of Object.entries(conditions)) {
      if (rawKey === '$and') {
        if (!Array.isArray(rawValue)) {
          continue;
        }

        const nested = rawValue
          .map((entry, index) =>
            this.buildSqlClause(
              (entry ?? {}) as Record<string, unknown>,
              queryAlias,
              conditionKeyMap,
              params,
              `${prefix}_and_${index}`,
              state,
            ),
          )
          .filter((clause): clause is string => Boolean(clause));

        if (nested.length > 0) {
          fragments.push(`(${nested.join(' AND ')})`);
        }
        continue;
      }

      if (rawKey === '$or') {
        if (!Array.isArray(rawValue)) {
          continue;
        }

        const nested = rawValue
          .map((entry, index) =>
            this.buildSqlClause(
              (entry ?? {}) as Record<string, unknown>,
              queryAlias,
              conditionKeyMap,
              params,
              `${prefix}_or_${index}`,
              state,
            ),
          )
          .filter((clause): clause is string => Boolean(clause));

        if (nested.length > 0) {
          fragments.push(`(${nested.join(' OR ')})`);
        }
        continue;
      }

      const mappedColumn = conditionKeyMap[rawKey] ?? rawKey;
      if (!this.isSafeIdentifier(mappedColumn)) {
        continue;
      }

      const columnExpr = `${queryAlias}.${mappedColumn}`;
      const columnClause = this.buildColumnSqlClause(
        columnExpr,
        rawValue,
        params,
        `${prefix}_${mappedColumn}`,
        state,
      );

      if (columnClause) {
        fragments.push(columnClause);
      }
    }

    if (fragments.length === 0) {
      return null;
    }

    return `(${fragments.join(' AND ')})`;
  }

  private buildColumnSqlClause(
    columnExpr: string,
    expectedValue: unknown,
    params: Record<string, unknown>,
    prefix: string,
    state: SqlParamState,
  ): string | null {
    if (expectedValue === null) {
      return `${columnExpr} IS NULL`;
    }

    if (Array.isArray(expectedValue)) {
      if (expectedValue.length === 0) {
        return null;
      }

      const paramName = this.nextParamName(prefix, state);
      params[paramName] = expectedValue;
      return `${columnExpr} IN (:...${paramName})`;
    }

    if (
      typeof expectedValue === 'object' &&
      expectedValue !== null &&
      !(expectedValue instanceof Date)
    ) {
      const operators = expectedValue as Record<string, unknown>;
      const fragments: string[] = [];

      for (const [operator, operand] of Object.entries(operators)) {
        if (operator === '$eq') {
          if (operand === null) {
            fragments.push(`${columnExpr} IS NULL`);
          } else {
            const paramName = this.nextParamName(prefix, state);
            params[paramName] = operand;
            fragments.push(`${columnExpr} = :${paramName}`);
          }
          continue;
        }

        if (operator === '$ne') {
          if (operand === null) {
            fragments.push(`${columnExpr} IS NOT NULL`);
          } else {
            const paramName = this.nextParamName(prefix, state);
            params[paramName] = operand;
            fragments.push(`${columnExpr} != :${paramName}`);
          }
          continue;
        }

        if (operator === '$in' && Array.isArray(operand)) {
          if (operand.length === 0) {
            continue;
          }

          const paramName = this.nextParamName(prefix, state);
          params[paramName] = operand;
          fragments.push(`${columnExpr} IN (:...${paramName})`);
          continue;
        }

        if (operator === '$nin' && Array.isArray(operand)) {
          if (operand.length === 0) {
            continue;
          }

          const paramName = this.nextParamName(prefix, state);
          params[paramName] = operand;
          fragments.push(`${columnExpr} NOT IN (:...${paramName})`);
          continue;
        }

        if (operator === '$exists') {
          fragments.push(
            Boolean(operand)
              ? `${columnExpr} IS NOT NULL`
              : `${columnExpr} IS NULL`,
          );
          continue;
        }
      }

      if (fragments.length === 0) {
        return null;
      }

      return fragments.length === 1 ? fragments[0] : `(${fragments.join(' AND ')})`;
    }

    const paramName = this.nextParamName(prefix, state);
    params[paramName] = expectedValue;
    return `${columnExpr} = :${paramName}`;
  }

  private nextParamName(prefix: string, state: SqlParamState): string {
    const name = `${prefix}_${state.value}`;
    state.value += 1;
    return name;
  }

  private isSafeIdentifier(identifier: string): boolean {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
  }
}
