export type VideoProvider = "zoom" | "google_meet" | "teams";

export interface VideoConnection {
  id: string;
  user_id: string;
  provider: VideoProvider;
  provider_account_id: string;
  is_active: boolean;
  created_at: string;
}

export interface BeginVideoConnectResult {
  url: string;
}
