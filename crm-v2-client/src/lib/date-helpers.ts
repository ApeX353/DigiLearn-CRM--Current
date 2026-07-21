import { format } from "date-fns";

export const formatDateTime = (value?: string) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return format(date, "MMM dd, yyyy h:mm a");
};
