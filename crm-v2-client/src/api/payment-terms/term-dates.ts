// Plans are paid by school term and the CRM does not know term dates, so a person
// sets the payment date for each one (EBI-FOCUS-001 Fix 3). The CRM keeps no record of
// whether a school agreed a date: saving or editing one proves nothing, so no screen
// may call dates agreed. The server's dates_source "agreed" only means "saved on the
// quote"; a real status needs an explicit confirmation step, which is not built.
export const termDatesProblem = (
  count: number,
  dates: Array<Date | undefined>,
): string | null => {
  if (count <= 1) return null;
  for (let i = 0; i < count; i += 1) {
    if (!dates[i]) return `Enter a payment date for Term ${i + 1}.`;
  }
  for (let i = 1; i < count; i += 1) {
    if ((dates[i] as Date).getTime() <= (dates[i - 1] as Date).getTime()) {
      return `Term ${i + 1} must be later than Term ${i}.`;
    }
  }
  return null;
};

/** What the review says about dates, by where they came from. */
export const paymentDatesNote = (source: "agreed" | "suggested" | null) =>
  source === "suggested"
    ? "Suggested by the CRM. These are not official school dates, and the school has not confirmed them."
    : "Proposed dates saved on this quote. The CRM does not record whether the school has agreed them.";

const twoDigits = (n: number) => String(n).padStart(2, "0");

/** A YYYY-MM-DD day as a local date, so a picker shows that same day. */
export const termDateFromDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

/** The calendar day picked, as the server stores it. */
export const termDatePayload = (date: Date) =>
  `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
