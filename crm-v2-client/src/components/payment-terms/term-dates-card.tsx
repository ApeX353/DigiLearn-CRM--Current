import { useState } from "react";
import { fetchTermDateSuggestions } from "~/api/invoices";
import {
  termDateFromDay,
  termDatePayload,
  termDatesProblem,
} from "~/api/payment-terms/term-dates";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { DatePicker } from "~/components/ui/date-picker";

export function useTermDates() {
  const [count, setCount] = useState(0);
  const [dates, setDates] = useState<Array<Date | undefined>>([]);
  return {
    count,
    dates,
    selectPlan: (numberOfTerms: number) => {
      setCount(numberOfTerms > 1 ? numberOfTerms : 0);
      setDates([]);
      if (numberOfTerms <= 1) return;
      void fetchTermDateSuggestions(numberOfTerms)
        .then((days) => setDates(days.map(termDateFromDay)))
        .catch(() => undefined);
    },
    setDate: (index: number, date: Date | undefined) =>
      setDates((previous) => {
        const next = [...previous];
        next[index] = date;
        return next;
      }),
    problem: termDatesProblem(count, dates),
    payload: () =>
      count > 1
        ? dates.slice(0, count).map((date) => termDatePayload(date as Date))
        : undefined,
  };
}

export function TermDatesCard({
  count,
  dates,
  setDate,
  problem,
}: Pick<
  ReturnType<typeof useTermDates>,
  "count" | "dates" | "setDate" | "problem"
>) {
  if (count <= 1) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proposed payment dates</CardTitle>
        <CardDescription>
          This plan is paid across {count} terms. These dates are suggested by
          the CRM and are not official school dates. Saving or changing a date
          does not record that the school has agreed it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="space-y-2">
              <span className="text-sm font-medium">Term {index + 1}</span>
              <DatePicker
                value={dates[index]}
                placeholder="Select a date"
                onChange={(date) => setDate(index, date)}
              />
            </div>
          ))}
        </div>
        {problem && (
          <p className="mt-2 text-xs text-muted-foreground">{problem}</p>
        )}
      </CardContent>
    </Card>
  );
}
