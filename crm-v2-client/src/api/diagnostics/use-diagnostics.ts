import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  DayLog,
  DiagnosticsHealth,
  InvestigateBundle,
  JobRunSummary,
  Paged,
  PersonSummary,
  SystemEventSummary,
} from "./types";

export const diagnosticsKeys = {
  all: ["diagnostics"] as const,
  health: () => [...diagnosticsKeys.all, "health"] as const,
  jobs: () => [...diagnosticsKeys.all, "jobs"] as const,
  people: (days: number) => [...diagnosticsKeys.all, "people", days] as const,
  events: (params: Record<string, string>) => [...diagnosticsKeys.all, "events", params] as const,
  investigate: (ref: string) => [...diagnosticsKeys.all, "investigate", ref] as const,
  dayLog: (day: string, kinds: string, person: string, q: string) => [...diagnosticsKeys.all, "log", day, kinds, person, q] as const,
};

const api = {
  health: (): Promise<DiagnosticsHealth> => apiClientAuth.get("/diagnostics/health").then((r) => r.data.data),
  jobs: (): Promise<JobRunSummary[]> => apiClientAuth.get("/diagnostics/job-runs/summary").then((r) => r.data.data),
  people: (days: number): Promise<PersonSummary[]> =>
    apiClientAuth.get("/diagnostics/people", { params: { days } }).then((r) => r.data.data),
  events: (params: Record<string, string>): Promise<Paged<SystemEventSummary>> =>
    apiClientAuth.get("/diagnostics/events", { params }).then((r) => r.data),
  investigate: (ref: string): Promise<InvestigateBundle> =>
    apiClientAuth.get(`/diagnostics/investigate/${encodeURIComponent(ref)}`).then((r) => r.data.data),
  runJob: (name: string) => apiClientAuth.post(`/diagnostics/jobs/${encodeURIComponent(name)}/run`).then((r) => r.data.data),
  dayLog: (day: string, kinds: string, person: string, q: string): Promise<DayLog> =>
    apiClientAuth
      .get("/diagnostics/log", { params: { day, ...(kinds ? { kinds } : {}), ...(person ? { person } : {}), ...(q ? { q } : {}) } })
      .then((r) => r.data.data),
  dayLogText: (day: string): Promise<string> =>
    apiClientAuth.get("/diagnostics/log.txt", { params: { day }, responseType: "text" }).then((r) => r.data as string),
};

export function useDayLog(day: string, kinds: string, person: string, q: string, enabled = true) {
  return useQuery({ queryKey: diagnosticsKeys.dayLog(day, kinds, person, q), queryFn: () => api.dayLog(day, kinds, person, q), enabled });
}

export const fetchDayLogText = api.dayLogText;

export function useDiagnosticsHealth(enabled = true) {
  return useQuery({ queryKey: diagnosticsKeys.health(), queryFn: api.health, enabled, refetchInterval: 60_000 });
}

export function useJobSummary(enabled = true) {
  return useQuery({ queryKey: diagnosticsKeys.jobs(), queryFn: api.jobs, enabled, refetchInterval: 60_000 });
}

export function usePeople(days: number, enabled = true) {
  return useQuery({ queryKey: diagnosticsKeys.people(days), queryFn: () => api.people(days), enabled });
}

export function useSystemEvents(params: Record<string, string>, enabled = true) {
  return useQuery({ queryKey: diagnosticsKeys.events(params), queryFn: () => api.events(params), enabled });
}

export function useInvestigate(reference: string | null) {
  return useQuery({
    queryKey: diagnosticsKeys.investigate(reference ?? ""),
    queryFn: () => api.investigate(reference!),
    enabled: !!reference,
    retry: false,
  });
}

export function useRunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.runJob,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: diagnosticsKeys.jobs() });
      void qc.invalidateQueries({ queryKey: diagnosticsKeys.health() });
    },
  });
}
