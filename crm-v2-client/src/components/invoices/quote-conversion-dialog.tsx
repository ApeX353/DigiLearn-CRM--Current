import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuoteConversionPreview } from "~/api/invoices";
import { apiErrorMessage } from "~/api/axios";
import {
  paymentDatesNote,
  termDateFromDay,
  termDatePayload,
  termDatesProblem,
} from "~/api/payment-terms/term-dates";
import { Button } from "~/components/ui/button";
import { DatePicker } from "~/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useCurrency } from "~/hooks/use-currency";

interface QuoteConversionDialogProps {
  quoteId: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (installmentDueDates?: string[]) => void;
}

// Nothing is created until the person confirms the dates and amounts shown here.
// The amounts come from the server, from the calculation the conversion will run.
export function QuoteConversionDialog({
  quoteId,
  isSubmitting,
  onClose,
  onConfirm,
}: QuoteConversionDialogProps) {
  const { formatCurrency } = useCurrency();
  const preview = useQuoteConversionPreview(quoteId ?? "");
  const data = preview.data;
  const [dates, setDates] = useState<Array<Date | undefined>>([]);
  // A second click can land before the button disables; the server would refuse
  // it, but the first conversion's success must not be lost to that refusal.
  const confirming = useRef(false);

  useEffect(() => {
    if (!isSubmitting) confirming.current = false;
  }, [isSubmitting]);

  useEffect(() => {
    setDates(data?.installments.map((row) => termDateFromDay(row.due_date)) ?? []);
  }, [data]);

  const count = data?.installments.length ?? 0;
  const problem = termDatesProblem(count, dates);
  const blocked = !data || !!data.already_invoiced || !!problem;

  return (
    <Dialog open={!!quoteId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Review invoice{data ? ` from ${data.quote_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Review every date and amount. No invoice is created until you
            confirm.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </p>
        )}
        {preview.error && (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(preview.error, "This quote could not be checked.")}
          </p>
        )}

        {data?.already_invoiced ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            This quote already has invoice {data.already_invoiced}. Open that
            invoice instead of raising another.
          </p>
        ) : (
          data && (
            <div className="space-y-3 text-sm">
              {count > 0 && (
                <>
                  <p className="text-muted-foreground">
                    {data.plan}. {paymentDatesNote(data.dates_source)}
                  </p>
                  <ul className="space-y-2">
                    {data.installments.map((row, index) => (
                      <li
                        key={row.term}
                        className="grid grid-cols-[4rem_1fr_auto] items-center gap-3"
                      >
                        <span className="font-medium">Term {row.term}</span>
                        <DatePicker
                          value={dates[index]}
                          placeholder="Select a date"
                          onChange={(date) =>
                            setDates((previous) => {
                              const next = [...previous];
                              next[index] = date;
                              return next;
                            })
                          }
                        />
                        <span className="font-medium">
                          {formatCurrency(row.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Invoice total</span>
                <span>{formatCurrency(data.total)}</span>
              </div>
              {problem && <p className="text-xs text-destructive">{problem}</p>}
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Go Back
          </Button>
          <Button
            disabled={blocked || isSubmitting}
            onClick={() => {
              if (confirming.current) return;
              confirming.current = true;
              onConfirm(
                count > 0
                  ? dates.map((date) => termDatePayload(date as Date))
                  : undefined,
              );
            }}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Schedule and Create Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
