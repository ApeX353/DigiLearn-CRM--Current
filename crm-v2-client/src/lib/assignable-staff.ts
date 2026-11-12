import type { StaffUser } from "~/api/users/types";

/**
 * Who may be given sales work.
 *
 * The assignee pickers called `useStaff({ status: "active" })` with no role
 * filter, so every active account appeared — finance, admin and support
 * included. Sales work belongs to the sales team, and offering the rest of the
 * company invites an assignment nobody can action.
 *
 * `useStaff` does accept a `role`, but only one, and "sales" is two roles. The
 * list endpoint already joins roles onto every row, so the filter is applied
 * here instead — no extra request, and one rule shared by every picker rather
 * than the same `.filter()` copied into four files.
 */
export const SALES_ROLES = ["sales_rep", "sales_manager"] as const;

export function isSalesStaff(member: Pick<StaffUser, "roles">): boolean {
  return (member?.roles ?? []).some((r) =>
    (SALES_ROLES as readonly string[]).includes(r?.name),
  );
}

/**
 * Sales staff, plus whoever is currently assigned.
 *
 * `keepId` matters: assignments made before this filter existed can point at
 * someone outside sales. Dropping them would make the picker show a blank or
 * silently misreport who owns the task — so the current holder always stays in
 * the list, and can be replaced but never quietly erased.
 */
export function salesStaff<T extends Pick<StaffUser, "id" | "roles">>(
  list: T[] | undefined,
  keepId?: string | null,
): T[] {
  return (list ?? []).filter(
    (member) => isSalesStaff(member) || (!!keepId && member.id === keepId),
  );
}
