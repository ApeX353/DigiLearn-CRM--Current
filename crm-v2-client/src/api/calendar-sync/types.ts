export type CalendarProvider = "google" | "microsoft";

export interface CalendarConnection {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  provider_account_id: string;
  calendar_id: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
}

export interface BeginConnectResult {
  url: string;
}
