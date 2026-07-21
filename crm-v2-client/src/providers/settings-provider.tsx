import { createContext, useContext, type ReactNode } from "react";
import { useAuthStore } from "~/stores/use-auth-store";
import { useAllSettings } from "~/api/settings";
import type { Setting } from "~/api/settings";
import { Skeleton } from "~/components/ui/skeleton";

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
  const { isAuthenticated } = useAuthStore();

  const { data: settingsData, isLoading } = useAllSettings(isAuthenticated);

  const settings = settingsData?.data || [];

  const settingsMap = new Map(settings?.map((s) => [s.key, s.value]));

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

  if (isLoading && isAuthenticated) {
    return (
      <div className="w-full h-screen flex gap-x-6">
        <div className="w-md h-full md:block hidden py-6">
          <Skeleton className="h-full" />
        </div>
        <div className="flex-1 h-screen py-6 space-y-6 max-w-7xl mx-auto">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-12" />
          <Skeleton className="h-6 w-3xl" />
        </div>
      </div>
    );
  }

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
