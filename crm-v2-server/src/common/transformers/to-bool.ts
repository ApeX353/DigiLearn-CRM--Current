/**
 * Robust string → boolean coercion for query-string filter DTOs.
 *
 * Why a helper instead of inline `value === 'true'`:
 *
 * The global `ValidationPipe` runs with `transform: true` and
 * `enableImplicitConversion: true`. That means class-transformer
 * performs an implicit conversion to the field's TS type BEFORE the
 * custom `@Transform` runs. For a `boolean` target it uses
 * `Boolean(value)`, so `"true"` → `true` AND `"false"` → `true`
 * (any non-empty string is truthy). The naive pattern
 *
 *     @Transform(({ value }) => value === 'true')
 *
 * then compares a boolean against a string and always returns
 * `false`. The result is that every `?field=false` filter across
 * the CRM is either ignored or, worse, treated as `false` when the
 * user asked for `true` (silently inverting the filter). Audit
 * (Apr 2026) caught this on leads.sla_breached, contacts.is_primary,
 * activities.open_only, and half a dozen others.
 *
 * This helper normalises every shape we might receive — the raw
 * query string, the already-boolean post-implicit-conversion value,
 * or an integer 0/1 — and returns `undefined` for anything it
 * can't reliably coerce so the filter drops cleanly rather than
 * defaulting to a wrong side.
 */
export function toBool(v: unknown): boolean | undefined {
  if (v === true || v === false) return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : undefined;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return undefined;
}
