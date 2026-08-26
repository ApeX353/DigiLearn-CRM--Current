import { createContext, useContext, type ReactNode } from "react";
import { usePublicSettings } from "~/api/settings";
import type { Setting } from "~/api/settings";

type SettingValue = string | number | boolean | object;

interface SettingsContextValue {
  settings: Setting[];
  isLoading: boolean;
  getSetting: (key: string) => SettingValue | undefined;
  getSettingString: (key: string, fallback?: string) => string;
  getSettingNumber: (key: string, fallback?: number) => number;
  getSettingBoolean: (key: string, fallback?: boolean) => boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { data: settingsData, isLoading } = usePublicSettings();
  const publicSettings = settingsData?.data || {};
  const settings = Object.entries(publicSettings).map(([key, value]) => ({
    key,
    value,
  })) as Setting[];
  const settingsMap = new Map(Object.entries(publicSettings));

  const getSetting = (key: string): SettingValue | undefined =>
    settingsMap.get(key);

  const getSettingString = (key: string, fallback = ""): string => {
    const val = settingsMap.get(key);
    return typeof val === "string" ? val : fallback;
  };

  const getSettingNumber = (key: string, fallback = 0): number => {
    const val = settingsMap.get(key);
    return typeof val === "number" ? val : fallback;
  };

  const getSettingBoolean = (key: string, fallback = false): boolean => {
    const val = settingsMap.get(key);
    return typeof val === "boolean" ? val : fallback;
  };

  return (
    <SettingsContext.Provider
      value={{
        settings: settings || [],
        isLoading,
        getSetting,
        getSettingString,
        getSettingNumber,
        getSettingBoolean,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettingsContext must be used within a SettingsProvider");
  }
  return context;
}
