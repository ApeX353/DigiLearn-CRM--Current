import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "../axios";
import type { Contact } from "./types";

export type UpdateContactChannels = Partial<
  Pick<Contact, "email" | "phone" | "whatsapp_number">
>;

function unwrapContact(payload: unknown): Contact {
  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload
  ) {
    return (payload as { data: Contact }).data;
  }
  return payload as Contact;
}

/** Saves a missing communication detail without leaving the next-step flow. */
export function useUpdateContactChannels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateContactChannels;
    }) =>
      apiClientAuth
        .put(`/contacts/${id}`, data)
        .then((response) => unwrapContact(response.data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
