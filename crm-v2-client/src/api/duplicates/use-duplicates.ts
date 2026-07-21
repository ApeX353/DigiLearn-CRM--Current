import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  DuplicateCandidate,
  DuplicateRecordType,
  DuplicateSignal,
  DuplicateSuspicion,
  DuplicateSuspicionStatus,
} from "./types";
import type { Lead } from "~/api/leads";
import type { School } from "~/api/schools";
import type { Contact } from "~/api/contacts";

export const duplicatesKeys = {
  all: ["duplicates"] as const,
  queue: (
    record_type?: DuplicateRecordType,
    status?: DuplicateSuspicionStatus | "all",
  ) =>
    [
      ...duplicatesKeys.all,
      "queue",
      record_type ?? "all",
      status ?? "pending",
    ] as const,
};

function unwrap<T>(res: { data: { data?: T } | T }): T {
  const body: any = res.data;
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

// ------------- Peek mutations -------------

export function usePeekLeadDuplicates() {
  return useMutation({
    mutationFn: (payload: {
      lead_name?: string;
      school_id?: string | null;
      primary_contact_id?: string | null;
      phone?: string | null;
      email?: string | null;
    }) =>
      apiClientAuth
        .post(`/duplicates/peek/lead`, payload)
        .then((res) => unwrap<DuplicateCandidate<Lead>[]>(res)),
  });
}

export function usePeekSchoolDuplicates() {
  return useMutation({
    mutationFn: (payload: {
      name?: string;
      city?: string | null;
      district?: string | null;
      province?: string | null;
    }) =>
      apiClientAuth
        .post(`/duplicates/peek/school`, payload)
        .then((res) => unwrap<DuplicateCandidate<School>[]>(res)),
  });
}

export function usePeekContactDuplicates() {
  return useMutation({
    mutationFn: (payload: {
      first_name?: string;
      last_name?: string;
      phone?: string | null;
      email?: string | null;
      school_id?: string | null;
    }) =>
      apiClientAuth
        .post(`/duplicates/peek/contact`, payload)
        .then((res) => unwrap<DuplicateCandidate<Contact>[]>(res)),
  });
}

// ------------- Record + manage -------------

export function useRecordDuplicateSuspicion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      record_type: DuplicateRecordType;
      new_record_id: string;
      existing_record_id: string;
      score: number;
      signals: DuplicateSignal[];
    }) =>
      apiClientAuth
        .post(`/duplicates`, payload)
        .then((res) => unwrap<DuplicateSuspicion>(res)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: duplicatesKeys.all });
    },
  });
}

export function useDuplicateQueue(
  record_type?: DuplicateRecordType,
  status: DuplicateSuspicionStatus | "all" = "pending",
) {
  return useQuery<DuplicateSuspicion[]>({
    queryKey: duplicatesKeys.queue(record_type, status),
    queryFn: () =>
      apiClientAuth
        .get(`/duplicates`, { params: { record_type, status } })
        .then((res) => unwrap<DuplicateSuspicion[]>(res)),
  });
}

export function useReviewDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        status: "merged" | "kept_separate" | "false_positive";
        note?: string | null;
      };
    }) =>
      apiClientAuth
        .patch(`/duplicates/${id}/review`, data)
        .then((res) => unwrap<DuplicateSuspicion>(res)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: duplicatesKeys.all });
    },
  });
}
