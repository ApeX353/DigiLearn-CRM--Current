export type SchedulingLinkLocation =
  | "zoom"
  | "google_meet"
  | "teams"
  | "phone"
  | "in_person"
  | "custom";

export interface AvailabilityWindow {
  day_of_week: number; // 0 = Sunday
  start_minutes_from_midnight: number;
  end_minutes_from_midnight: number;
}

export interface SchedulingLink {
  id: string;
  owner_user_id: string;
  slug: string;
  title: string;
  description: string | null;
  location_type: SchedulingLinkLocation;
  location_detail: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  availability: AvailabilityWindow[] | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateSchedulingLinkDto {
  slug: string;
  title: string;
  description?: string;
  location_type: SchedulingLinkLocation;
  location_detail?: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  min_notice_minutes?: number;
  max_days_ahead?: number;
  availability?: AvailabilityWindow[];
  timezone?: string;
  is_active?: boolean;
}

export interface UpdateSchedulingLinkDto
  extends Partial<Omit<CreateSchedulingLinkDto, "slug">> {}

export interface PublicLinkView {
  slug: string;
  title: string;
  description: string | null;
  location_type: SchedulingLinkLocation;
  duration_minutes: number;
  timezone: string;
  owner: { name: string };
}

export interface Slot {
  start_at: string;
  end_at: string;
  /**
   * `true` when the slot is currently held by another invitee or
   * confirmed. The booking grid renders these grayed-out and
   * non-clickable.
   */
  held: boolean;
}

export interface PublicViewResponse {
  link: PublicLinkView;
  slots: Slot[];
}

export interface Hold {
  id: string;
  start_at: string;
  end_at: string;
  expires_at: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
}

export interface CreateHoldDto {
  start_at: string;
  invitee_email?: string;
}

export interface ConfirmHoldDto {
  hold_id: string;
  invitee_email: string;
  invitee_name: string;
  notes?: string;
}

export interface ConfirmedBooking {
  activity_id: string;
  meeting_id: string;
  start_at: string;
  end_at: string;
}
