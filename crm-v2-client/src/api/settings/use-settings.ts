import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { Setting, CreateSettingDto, BulkSettingsDto, SettingsResponse } from "./types";
import type { ApiResponse } from "../common-api-type";

// Query keys
export const settingsKeys = {
  all: ["settings"] as const,
  allSettings: () => [...settingsKeys.all, "all"] as const,
  publicSettings: () => [...settingsKeys.all, "public"] as const,
  byCategory: (category: string) => [...settingsKeys.all, "category", category] as const,
  byKey: (key: string) => [...settingsKeys.all, "key", key] as const,
  byKeys: (keys: string[]) => [...settingsKeys.all, "keys", ...keys] as const,
};

// API functions
const settingsApi = {
  // Get all settings with full metadata (admin only)
  getAllSettings: (): Promise<ApiResponse<Setting[]>> =>
    apiClientAuth.get("/settings/all").then((res) => res.data),

  // Get public settings
  getPublicSettings: (): Promise<SettingsResponse> =>
    apiClientAuth.get("/settings/public").then((res) => res.data),

  // Get settings by category
  getSettingsByCategory: (category: string): Promise<Setting[]> =>
    apiClientAuth.get(`/settings/category/${category}`).then((res) => res.data),

  // Get a single setting by key
  getSetting: (key: string): Promise<Setting> =>
    apiClientAuth.get(`/settings/${key}`).then((res) => res.data),

  // Get multiple settings by keys (returns key-value pairs)
  getSettings: (keys: string[]): Promise<SettingsResponse> =>
    apiClientAuth.get("/settings", { params: { keys: keys.join(",") } }).then((res) => res.data),

  // Set a single setting (create or update)
  setSetting: (data: CreateSettingDto): Promise<Setting> =>
    apiClientAuth.post("/settings", data).then((res) => res.data),

  // Set multiple settings at once
  setSettings: (data: BulkSettingsDto): Promise<Setting[]> =>
    apiClientAuth.post("/settings/bulk", data).then((res) => res.data),

  // Delete a setting (soft delete)
  deleteSetting: (key: string): Promise<void> =>
    apiClientAuth.delete(`/settings/${key}`).then((res) => res.data),

  // Permanently delete a setting
  hardDeleteSetting: (key: string): Promise<void> =>
    apiClientAuth.delete(`/settings/${key}/hard`).then((res) => res.data),

  // Restore a deleted setting
  restoreSetting: (key: string): Promise<Setting> =>
    apiClientAuth.post(`/settings/${key}/restore`).then((res) => res.data),
};

// Hooks

/**
 * Get all settings with full metadata (admin only)
 */
export function useAllSettings(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.allSettings(),
    queryFn: settingsApi.getAllSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
}

/**
 * Get public settings
 */
export function usePublicSettings() {
  return useQuery({
    queryKey: settingsKeys.publicSettings(),
    queryFn: settingsApi.getPublicSettings,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Get settings by category
 */
export function useSettingsByCategory(category: string) {
  return useQuery({
    queryKey: settingsKeys.byCategory(category),
    queryFn: () => settingsApi.getSettingsByCategory(category),
    staleTime: 5 * 60 * 1000,
    enabled: !!category,
  });
}

/**
 * Get a single setting by key
 */
export function useSetting(key: string) {
  return useQuery({
    queryKey: settingsKeys.byKey(key),
    queryFn: () => settingsApi.getSetting(key),
    staleTime: 5 * 60 * 1000,
    enabled: !!key,
  });
}

/**
 * Get multiple settings by keys
 */
export function useSettings(keys: string[]) {
  return useQuery({
    queryKey: settingsKeys.byKeys(keys),
    queryFn: () => settingsApi.getSettings(keys),
    staleTime: 5 * 60 * 1000,
    enabled: keys.length > 0,
  });
}

/**
 * Set a single setting (create or update)
 */
export function useSetSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.setSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Set setting error:", handleApiError(error));
    },
  });
}

/**
 * Set multiple settings at once
 */
export function useSetSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.setSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Set settings error:", handleApiError(error));
    },
  });
}

/**
 * Delete a setting (soft delete)
 */
export function useDeleteSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.deleteSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Delete setting error:", handleApiError(error));
    },
  });
}

/**
 * Permanently delete a setting
 */
export function useHardDeleteSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.hardDeleteSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Hard delete setting error:", handleApiError(error));
    },
  });
}

/**
 * Restore a deleted setting
 */
export function useRestoreSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: settingsApi.restoreSetting,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
    onError: (error) => {
      console.error("Restore setting error:", handleApiError(error));
    },
  });
}
