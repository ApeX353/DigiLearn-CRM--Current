import { useCallback } from "react";
import { useSettingsContext } from "~/providers/settings-provider";

const DEFAULT_CURRENCY = "USD";

export function useCurrency() {
  const { getSettingString } = useSettingsContext();

  const currency = getSettingString("currency", DEFAULT_CURRENCY);

  const formatCurrency = useCallback(
    (amount: number) => {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(amount);
    },
    [currency],
  );

  return { currency, formatCurrency };
}
