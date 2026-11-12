import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * A line's discount may not exceed its amount (quantity × unit price).
 *
 * Field-by-field validation passed `{unit_price: 100, discount: 150}` with
 * zero errors and the invoice was stored with a total of -50 (19 Oct 2026
 * financial review). This checks the relationship at the DTO, so the request
 * is refused before any service runs; the service repeats the check for
 * callers that bypass the pipe.
 *
 * When quantity or unit price is absent (a partial item update) the check
 * passes here and the service decides with the stored values.
 */
export function IsDiscountWithinLine(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isDiscountWithinLine',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          if (value === undefined || value === null) return true;
          const line = args.object as { quantity?: unknown; unit_price?: unknown };
          const quantity = Number(line.quantity);
          const unitPrice = Number(line.unit_price);
          if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return true;
          const lineAmount = Math.round(quantity * unitPrice * 100) / 100;
          return Number(value) <= lineAmount + 0.005;
        },
        defaultMessage(): string {
          return 'discount cannot be more than the line amount (quantity × unit price); a line cannot be worth less than nothing';
        },
      },
    });
  };
}
