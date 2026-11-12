/**
 * The dates a person enters for a plan paid across terms (EBI-FOCUS-001 Fix 3). No
 * date is inferred by the application any more, so a test creating a plan supplies
 * them. Thirty days apart is only a value for tests; it means nothing about terms.
 */
export const agreedDates = (count: number): string[] =>
  Array.from({ length: count }, (_, i) =>
    new Date(Date.now() + (i + 1) * 30 * 86_400_000).toISOString().slice(0, 10),
  );
