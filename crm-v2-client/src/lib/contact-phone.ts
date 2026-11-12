import type { Contact } from "~/api/contacts";

type ContactChannel = "call" | "whatsapp";

function firstNumber(...numbers: Array<string | null | undefined>) {
  return numbers.find((number) => number?.trim())?.trim() ?? "";
}

/** Selects the number that fits the channel, without losing valid fallbacks. */
export function contactPhoneFor(
  contact: Pick<Contact, "phone" | "secondary_phone" | "whatsapp_number"> | undefined,
  channel: ContactChannel,
) {
  if (!contact) return "";

  return channel === "whatsapp"
    ? firstNumber(contact.whatsapp_number, contact.phone, contact.secondary_phone)
    : firstNumber(contact.phone, contact.secondary_phone, contact.whatsapp_number);
}
