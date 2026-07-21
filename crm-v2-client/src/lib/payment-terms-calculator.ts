/**
 * Payment Terms Calculator
 *
 * Calculates interest for payment plans based on the selected payment term's
 * configuration (interest rate, method, number of terms).
 */

import type { InterestCalculationMethod } from "~/api/payment-terms/types";

export interface PaymentTermCalculationParams {
  subtotal: number;
  discount: number;
  taxRate: number; // Percentage (e.g., 16 for 16%)
  interestRate: number; // Annual percentage rate (e.g., 15 for 15%)
  numberOfTerms: number; // From the payment term's number_of_terms
  interestCalculationMethod: InterestCalculationMethod;
}

export interface PaymentTermCalculationResult {
  subtotalAfterDiscount: number;
  interestAmount: number;
  amountBeforeTax: number;
  taxAmount: number;
  total: number;
  installmentAmount?: number;
  termCount?: number;
}

/**
 * Calculate interest based on the payment term's method
 *
 * - "compound": M = PV × i × (1 + i)^n / [(1 + i)^n - 1]
 *   where i = interestRate / numberOfTerms, n = numberOfTerms
 * - "simple": interest = PV × (rate / 100)
 * - "flat": interest = PV × (rate / 100)
 * - "none": no interest
 */
export function calculatePaymentTerms(
  params: PaymentTermCalculationParams,
): PaymentTermCalculationResult {
  const {
    subtotal,
    discount,
    taxRate,
    interestRate,
    numberOfTerms,
    interestCalculationMethod,
  } = params;
  console.log(params);

  // Step 1: Cash Price (PV)
  const cashPrice = subtotal - discount;
  const rate = interestRate / 100;

  let interestAmount = 0;
  let totalPayable = cashPrice;
  let installment = 0;

  if (rate > 0 && numberOfTerms > 0 && interestCalculationMethod !== "none") {
    switch (interestCalculationMethod) {
      case "compound": {
        const perTermRate = rate; // already per term, e.g., 0.18 for 18%
        const onePlusI = 1 + perTermRate;
        const onePlusIPowerN = Math.pow(onePlusI, numberOfTerms);
        installment =
          (cashPrice * perTermRate * onePlusIPowerN) / (onePlusIPowerN - 1);
        totalPayable = installment * numberOfTerms;
        interestAmount = totalPayable - cashPrice;
        break;
      }
      case "simple": {
        interestAmount = cashPrice * rate;
        totalPayable = cashPrice + interestAmount;
        installment = numberOfTerms > 0 ? totalPayable / numberOfTerms : 0;
        break;
      }
      case "flat": {
        interestAmount = cashPrice * rate;
        totalPayable = cashPrice + interestAmount;
        installment = numberOfTerms > 0 ? totalPayable / numberOfTerms : 0;
        break;
      }
    }
  } else if (numberOfTerms > 0) {
    installment = cashPrice / numberOfTerms;
  }

  // Amount before tax = total payable (cash price + interest)
  const amountBeforeTax = totalPayable;

  // Tax
  const taxAmount = (amountBeforeTax * taxRate) / 100;

  // Final total
  const total = amountBeforeTax + taxAmount;

  return {
    subtotalAfterDiscount: cashPrice,
    interestAmount,
    amountBeforeTax,
    taxAmount,
    total,
    installmentAmount: installment > 0 ? installment : undefined,
    termCount: numberOfTerms > 0 ? numberOfTerms : undefined,
  };
}

/**
 * Format installment information for display
 */
export function formatInstallmentInfo(
  result: PaymentTermCalculationResult,
): string {
  if (!result.installmentAmount || !result.termCount) {
    return "Cash payment - no installments";
  }

  return `${result.termCount} installments of $${result.installmentAmount.toFixed(2)} per term`;
}

/**
 * Generate payment terms notes for document
 */
export function generatePaymentTermsNotes(
  paymentTermName: string,
  result: PaymentTermCalculationResult,
  interestRate: number,
  termsAndConditions?: string,
): string {
  const notes: string[] = [];

  notes.push(`Payment Terms: ${paymentTermName}`);

  if (result.installmentAmount && result.termCount) {
    notes.push(
      `Installment Plan: ${result.termCount} terms @ $${result.installmentAmount.toFixed(2)} per term`,
    );
    notes.push(`Interest Rate: ${interestRate.toFixed(2)}%`);
    notes.push(`Total Interest: $${result.interestAmount.toFixed(2)}`);
  } else {
    notes.push("Payment Type: Cash (no interest)");
  }

  if (termsAndConditions) {
    notes.push("");
    notes.push("Terms & Conditions:");
    notes.push(termsAndConditions);
  }

  return notes.join("\n");
}
