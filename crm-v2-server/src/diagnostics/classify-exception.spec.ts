import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { classifyException, GENERIC_500_MESSAGE } from './classify-exception';

function pgError(code: string, message = 'db says no', detail?: string): QueryFailedError {
  const driverError = Object.assign(new Error(message), { code, detail });
  return new QueryFailedError('SELECT 1', [], driverError);
}

describe('classifyException', () => {
  it('passes HttpExceptions through with their own status and message', () => {
    const c = classifyException(new NotFoundException('Lead not found'));
    expect(c.status).toBe(404);
    expect(c.message).toBe('Lead not found');
    expect(c.persist).toBe('never');
    expect(c.kind).toBeNull();
  });

  it('never persists 401 or 404', () => {
    expect(classifyException(new UnauthorizedException()).persist).toBe('never');
    expect(classifyException(new NotFoundException()).persist).toBe('never');
  });

  it('records 403 behind the capture_403 setting', () => {
    const c = classifyException(new ForbiddenException('No'));
    expect(c.status).toBe(403);
    expect(c.kind).toBe('http_403');
    expect(c.level).toBe('info');
    expect(c.persist).toBe('setting:capture_403');
  });

  it('treats a string[] 400 as a validation failure and keeps the array for the client', () => {
    const c = classifyException(new BadRequestException(['name should not be empty', 'school_id must be a UUID']));
    expect(c.status).toBe(400);
    expect(Array.isArray(c.message)).toBe(true);
    expect(c.kind).toBe('validation');
    expect(c.persist).toBe('setting:capture_validation');
    expect(c.internalMessage).toContain('name should not be empty');
  });

  it('does not treat an ordinary 400 as validation; a refused read stays behind the setting', () => {
    const c = classifyException(new BadRequestException('Primary contact is required'), 'GET');
    expect(c.kind).toBe('refused');
    expect(c.persist).toBe('setting:capture_validation');
  });

  it('always records a business refusal of a write (the Coghlan stage-move case, 20 Oct 2026)', () => {
    const c = classifyException(
      new BadRequestException('Deal stage cannot skip from "Negotiation" to "Delivery & Installation". Move it to "PO/Contract Received" first.'),
      'PUT',
    );
    expect(c.status).toBe(400);
    expect(c.kind).toBe('refused');
    expect(c.level).toBe('info');
    expect(c.persist).toBe('always');
    expect(c.internalMessage).toContain('cannot skip');
    expect(c.stack).toBeNull();
  });

  it('always records a 409 or 422 on a write, never a 404 or 401', () => {
    expect(classifyException(new ConflictException('already recorded'), 'POST').persist).toBe('always');
    expect(classifyException(new ConflictException('already recorded'), 'POST').kind).toBe('refused');
    expect(classifyException(new UnprocessableEntityException('no'), 'PATCH').persist).toBe('always');
    expect(classifyException(new NotFoundException(), 'DELETE').persist).toBe('never');
    expect(classifyException(new UnauthorizedException(), 'POST').persist).toBe('never');
  });

  it('always records validation failures on writes, but not on reads', () => {
    const write = classifyException(new BadRequestException(['amount must be positive']), 'POST');
    expect(write.kind).toBe('validation');
    expect(write.persist).toBe('always');
    const read = classifyException(new BadRequestException(['page must be a number']), 'GET');
    expect(read.persist).toBe('setting:capture_validation');
  });

  it('always persists a thrown 5xx HttpException with its stack', () => {
    const c = classifyException(new InternalServerErrorException('boom'));
    expect(c.status).toBe(500);
    expect(c.kind).toBe('http_5xx');
    expect(c.persist).toBe('always');
    expect(c.stack).toContain('boom');
  });

  it('translates known Postgres codes to a 4xx with a safe message and persists at warn', () => {
    const unique = classifyException(pgError('23505', 'duplicate key value violates unique constraint "x"', 'Key (a)=(b) already exists.'));
    expect(unique.status).toBe(409);
    expect(unique.message).toBe('This record already exists.');
    expect(unique.kind).toBe('db_constraint');
    expect(unique.level).toBe('warn');
    expect(unique.dbCode).toBe('23505');
    expect(unique.internalMessage).toContain('Key (a)=(b)');

    expect(classifyException(pgError('23503')).status).toBe(409);
    expect(classifyException(pgError('23502')).status).toBe(400);
    expect(classifyException(pgError('22P02')).status).toBe(400);
    expect(classifyException(pgError('40P01')).status).toBe(503);
    expect(classifyException(pgError('57014')).status).toBe(504);
  });

  it('turns an unknown Postgres code into a generic 500 and keeps the real cause internal', () => {
    const c = classifyException(pgError('XX000', 'internal error'));
    expect(c.status).toBe(500);
    expect(c.message).toBe(GENERIC_500_MESSAGE);
    expect(c.internalMessage).toContain('internal error');
    expect(c.persist).toBe('always');
  });

  it('maps EntityNotFoundError to 404 without a row', () => {
    const c = classifyException(new EntityNotFoundError('Lead', { id: 'x' }));
    expect(c.status).toBe(404);
    expect(c.persist).toBe('never');
  });

  it('turns a plain Error into a generic 500 that is always persisted', () => {
    const c = classifyException(new Error('Setting foo is not a number'));
    expect(c.status).toBe(500);
    expect(c.message).toBe(GENERIC_500_MESSAGE);
    expect(c.internalMessage).toBe('Setting foo is not a number');
    expect(c.errorName).toBe('Error');
    expect(c.persist).toBe('always');
  });

  it('copes with a thrown non-error', () => {
    const c = classifyException('just a string');
    expect(c.status).toBe(500);
    expect(c.internalMessage).toBe('just a string');
  });
});

describe('classifyException: structured refusals (EBI-FOCUS-001)', () => {
  const body = { code: 'SOME_STABLE_CODE', message: 'A sentence.', details: { n: 1 } };

  it('carries the code and details to the client', () => {
    const c = classifyException(new ConflictException(body), 'PATCH');
    expect(c).toEqual(expect.objectContaining(body));
    expect(c.status).toBe(409);
  });

  it('adds neither field to an ordinary exception', () => {
    const c = classifyException(new BadRequestException('plain'), 'PATCH');
    expect(c.code).toBeUndefined();
    expect(c.details).toBeUndefined();
  });
});
