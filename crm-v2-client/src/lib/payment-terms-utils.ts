import type { PaymentTerm } from "~/api/payment-terms";
import type { PaymentTermCalculationResult } from "./payment-terms-calculator";

/**
 * Format payment terms information for notes field
 *
 * @param term - The payment term object
 * @param interest - The calculated interest amount
 * @param total - The total amount including interest
 * @param result - The calculation result from payment terms calculator
 * @returns Formatted string for notes field
 */
export function formatPaymentTermsForNotes(
  term: PaymentTerm,
  interest: number,
  total: number,
  result: PaymentTermCalculationResult
): string {
  const lines = [
    `Payment Plan: ${term.name || term.type}`,
    `Interest Rate: ${term.interest_rate?.toFixed(2)}% (${term.interest_calculation_method})`,
    `Interest Amount: $${interest.toFixed(2)}`,
    `Total: $${total.toFixed(2)}`,
  ];

  if (result.installmentAmount && result.termCount) {
    lines.push(
      `Installments: ${result.termCount} terms @ $${result.installmentAmount.toFixed(2)}/term`
    );
  }

  if (term.terms_and_conditions) {
    lines.push("", "Terms & Conditions:", term.terms_and_conditions);
  }

  return lines.join("\n");
}
