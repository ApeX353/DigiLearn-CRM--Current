import { HttpException, HttpStatus } from '@nestjs/common';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import { SystemEventKind, SystemEventLevel } from './entities/system-event.entity';

/** Whether the filter should write a system_events row for this failure. */
export type PersistRule =
  | 'always'
  | 'never'
  | 'setting:capture_403'
  | 'setting:capture_validation';

export interface ClassifiedException {
  status: number;
  /** What the user sees. Validation keeps Nest's string[] so the client's parser still works. */
  message: string | string[];
  error: string;
  kind: SystemEventKind | null;
  level: SystemEventLevel;
  persist: PersistRule;
  errorName: string;
  /** The real cause, for the row and stdout; never sent to the client. */
  internalMessage: string;
  stack: string | null;
  dbCode: string | null;
  /** A stable refusal code and its facts, when the thrower supplied them. */
  code?: string;
  details?: unknown;
}

export const GENERIC_500_MESSAGE =
  'Something went wrong on our side. Please try again; if it keeps happening, report it and quote the reference code.';

/**
 * Postgres SQLSTATE → what to tell the user. Each of these used to surface as
 * a bare 500 "Internal server error" because nothing translated them; every
 * one is also a latent bug (the API let an invalid write reach the database),
 * so they are persisted at `warn` even though the client now gets a 4xx.
 */
const PG_CODES: Record<string, { status: number; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, message: 'This record already exists.' },
  '23503': {
    status: HttpStatus.CONFLICT,
    message: 'This refers to a record that does not exist, or is still linked to other records.',
  },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'A required value is missing.' },
  '23514': { status: HttpStatus.BAD_REQUEST, message: 'A value is outside what is allowed.' },
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'A value has the wrong format.' },
  '22001': { status: HttpStatus.BAD_REQUEST, message: 'A value is too long.' },
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'A number is out of range.' },
  '22007': { status: HttpStatus.BAD_REQUEST, message: 'A date or time has the wrong format.' },
  '22008': { status: HttpStatus.BAD_REQUEST, message: 'A date or time is out of range.' },
  '40P01': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'The system is busy. Please try again.' },
  '40001': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'The system is busy. Please try again.' },
  '57014': {
    status: HttpStatus.GATEWAY_TIMEOUT,
    message: 'The request took too long. Try again, or narrow it down.',
  },
  '53300': { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'The system is busy. Please try again.' },
};

function statusText(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string'
    ? name.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : 'Error';
}

function stackOf(e: unknown): string | null {
  return e instanceof Error && typeof e.stack === 'string' ? e.stack : null;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * @param method the HTTP method, when known. A business refusal of a WRITE
 *   (400 "Deal stage cannot skip…", 409 "already recorded", 422) is always
 *   recorded: it is the moment a person tried to do something and the
 *   system said no, which is exactly what support needs to see. Until
 *   20 Oct 2026 these were kept only behind the capture_validation setting
 *   (off), so a rep refused four times in a row left no trace at all. Refused
 *   reads (a 400 on a GET) stay behind the setting; they are noise.
 */
export function classifyException(exception: unknown, method?: string | null): ClassifiedException {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    const message: string | string[] =
      typeof body === 'string'
        ? body
        : ((body as { message?: string | string[] }).message ?? exception.message);
    const error =
      typeof body === 'object' && body && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : statusText(status);
    const isValidation = status === HttpStatus.BAD_REQUEST && Array.isArray(message);
    const isWrite = WRITE_METHODS.has(String(method ?? '').toUpperCase());
    const isRefusal =
      status === HttpStatus.BAD_REQUEST ||
      status === HttpStatus.CONFLICT ||
      status === HttpStatus.UNPROCESSABLE_ENTITY;

    let kind: SystemEventKind | null = null;
    let level: SystemEventLevel = 'info';
    let persist: PersistRule = 'never';
    if (status >= 500) {
      kind = 'http_5xx';
      level = 'error';
      persist = 'always';
    } else if (status === HttpStatus.FORBIDDEN) {
      kind = 'http_403';
      level = 'info';
      persist = 'setting:capture_403';
    } else if (isValidation) {
      kind = 'validation';
      level = 'info';
      persist = isWrite ? 'always' : 'setting:capture_validation';
    } else if (isRefusal) {
      kind = 'refused';
      level = 'info';
      persist = isWrite ? 'always' : 'setting:capture_validation';
    }
    return {
      status,
      message,
      error,
      kind,
      level,
      persist,
      errorName: exception.name,
      internalMessage: Array.isArray(message) ? message.join('; ') : message,
      stack: status >= 500 ? stackOf(exception) : null,
      dbCode: null,
      ...(typeof body === 'object' && body && typeof (body as { code?: unknown }).code === 'string'
        ? { code: (body as { code: string }).code }
        : {}),
      ...(typeof body === 'object' && body && (body as { details?: unknown }).details !== undefined
        ? { details: (body as { details: unknown }).details }
        : {}),
    };
  }

  if (exception instanceof QueryFailedError) {
    const driver = (exception as QueryFailedError & { driverError?: { code?: string; detail?: string } }).driverError;
    const code = driver?.code ?? (exception as { code?: string }).code ?? null;
    const known = code ? PG_CODES[code] : undefined;
    if (known) {
      return {
        status: known.status,
        message: known.message,
        error: statusText(known.status),
        kind: 'db_constraint',
        level: 'warn',
        persist: 'always',
        errorName: 'QueryFailedError',
        internalMessage: `${code}: ${exception.message}${driver?.detail ? ` — ${driver.detail}` : ''}`,
        stack: stackOf(exception),
        dbCode: code,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: GENERIC_500_MESSAGE,
      error: 'Internal Server Error',
      kind: 'http_5xx',
      level: 'error',
      persist: 'always',
      errorName: 'QueryFailedError',
      internalMessage: `${code ?? 'no code'}: ${exception.message}`,
      stack: stackOf(exception),
      dbCode: code,
    };
  }

  if (exception instanceof EntityNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      message: 'Record not found.',
      error: 'Not Found',
      kind: null,
      level: 'info',
      persist: 'never',
      errorName: 'EntityNotFoundError',
      internalMessage: exception.message,
      stack: null,
      dbCode: null,
    };
  }

  const err = exception instanceof Error ? exception : null;
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: GENERIC_500_MESSAGE,
    error: 'Internal Server Error',
    kind: 'http_5xx',
    level: 'error',
    persist: 'always',
    errorName: err?.name ?? typeof exception,
    internalMessage: err?.message ?? String(exception),
    stack: stackOf(exception),
    dbCode: null,
  };
}
