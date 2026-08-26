/**
 * Coercion for anything written into the `deals.probability` column.
 *
 * Why a helper instead of an inline `Number(stage.probability)`:
 *
 * `stages.probability` is `numeric(5,2)` while `deals.probability` is a
 * plain `integer`. `CreateStageDto` validates stage probability with
 * `@IsNumber()` and documents `25.5` as the example, so an admin can
 * legitimately set a fractional probability from Settings → Pipelines.
 * Copying that value straight across makes Postgres reject the write
 * with `invalid input syntax for type integer`, and because every stage
 * transition runs inside a transaction that also writes
 * `deal_stage_history` and auto-completes the matching tasks, the whole
 * move rolls back. One 25.5 stage is enough to break drag-to-stage,
 * bulk moves, rollbacks, lead conversion and auto-advance for every
 * deal that touches it.
 *
 * The pg driver hands `numeric` columns back as strings, so the value
 * arriving here is normally `'25.50'` rather than `25.5` — hence the
 * `Number()` before rounding. `|| 0` catches `null` / `undefined` /
 * unparseable input so a missing probability degrades to 0 instead of
 * sending `NaN` into the same transaction.
 */
export function toDealProbability(value: unknown): number {
  return Math.round(Number(value) || 0);
}
