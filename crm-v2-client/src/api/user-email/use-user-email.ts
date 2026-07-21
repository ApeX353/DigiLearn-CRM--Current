import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import type {
  CreateSmtpAccountDto,
  SendResult,
  SendUserEmailDto,
  SendWithTemplateDto,
  UpdateUserEmailAccountDto,
  UserEmailAccount,
  VerifyResult,
} from "./types";

export const userEmailKeys = {
  all: ["user-email"] as const,
  accounts: () => [...userEmailKeys.all, "accounts"] as const,
  account: (id: string) => [...userEmailKeys.all, "account", id] as const,
};

function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    (payload as { data?: unknown }).data !== undefined
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

const api = {
  listAccounts: (): Promise<UserEmailAccount[]> =>
    apiClientAuth
      .get("/user-email/accounts")
      .then((r) => unwrap<UserEmailAccount[]>(r.data)),

  createSmtp: (dto: CreateSmtpAccountDto): Promise<UserEmailAccount> =>
    apiClientAuth
      .post("/user-email/accounts/smtp", dto)
      .then((r) => unwrap<UserEmailAccount>(r.data)),

  update: (
    id: string,
    dto: UpdateUserEmailAccountDto,
  ): Promise<UserEmailAccount> =>
    apiClientAuth
      .patch(`/user-email/accounts/${id}`, dto)
      .then((r) => unwrap<UserEmailAccount>(r.data)),

  remove: (id: string): Promise<void> =>
    apiClientAuth
      .delete(`/user-email/accounts/${id}`)
      .then(() => undefined),

  verify: (id: string): Promise<VerifyResult> =>
    apiClientAuth
      .post(`/user-email/accounts/${id}/verify`)
      .then((r) => unwrap<VerifyResult>(r.data)),

  testSend: (id: string, to?: string): Promise<SendResult> =>
    apiClientAuth
      .post(`/user-email/accounts/${id}/test-send`, { to })
      .then((r) => unwrap<SendResult>(r.data)),

  send: (dto: SendUserEmailDto): Promise<SendResult> =>
    apiClientAuth
      .post(`/user-email/send`, dto)
      .then((r) => unwrap<SendResult>(r.data)),

  sendTemplate: (dto: SendWithTemplateDto): Promise<SendResult> =>
    apiClientAuth
      .post(`/user-email/send/template`, dto)
      .then((r) => unwrap<SendResult>(r.data)),
};

export function useUserEmailAccounts() {
  return useQuery({
    queryKey: userEmailKeys.accounts(),
    queryFn: api.listAccounts,
    staleTime: 30 * 1000,
  });
}

export function useCreateSmtpAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSmtp,
    onSuccess: () => qc.invalidateQueries({ queryKey: userEmailKeys.all }),
  });
}

export function useUpdateUserEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateUserEmailAccountDto;
    }) => api.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: userEmailKeys.all }),
  });
}

export function useDeleteUserEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: userEmailKeys.all }),
  });
}

export function useVerifyEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.verify,
    onSuccess: () => qc.invalidateQueries({ queryKey: userEmailKeys.all }),
  });
}

export function useTestSendEmailAccount() {
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to?: string }) =>
      api.testSend(id, to),
  });
}

export function useSendUserEmail() {
  return useMutation({ mutationFn: api.send });
}

export function useSendTemplateEmail() {
  return useMutation({ mutationFn: api.sendTemplate });
}
