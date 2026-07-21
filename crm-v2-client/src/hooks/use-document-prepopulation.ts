import { useMemo } from "react";
import { useDeal } from "~/api/deals";
import { useSchool, type School } from "~/api/schools";
import { useLead } from "~/api/leads";
import { useQuote } from "~/api/quotes";

interface PrepopulationParams {
  schoolId?: string | null;
  dealId?: string | null;
  leadId?: string | null;
  personId?: string | null;
  quoteId?: string | null;
}

interface DocumentItem {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
}

interface PrepopulationData {
  isReady: boolean;
  isLoading: boolean;
  school_id?: string;
  deal_id?: string;
  person_id?: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  items?: DocumentItem[];
  notes?: string;
}

export function useDocumentPrepopulation(
  params: PrepopulationParams
): PrepopulationData {
  const { schoolId, dealId, leadId, personId, quoteId } = params;

  // Fetch entities based on provided IDs
  const { data: dealData, isLoading: isDealLoading } = useDeal(dealId || "");
  const { data: schoolData, isLoading: isSchoolLoading } = useSchool(
    schoolId || ""
  );
  const { data: leadData, isLoading: isLeadLoading } = useLead(leadId || "");
  const { data: quoteData, isLoading: isQuoteLoading } = useQuote(
    quoteId || ""
  );

  return useMemo(() => {
    // Determine if we're still loading
    const loadingChecks = [
      { id: dealId, isLoading: isDealLoading },
      { id: schoolId, isLoading: isSchoolLoading },
      { id: leadId, isLoading: isLeadLoading },
      { id: quoteId, isLoading: isQuoteLoading },
    ];

    const isLoading = loadingChecks.some(
      (check) => check.id && check.isLoading
    );

    // Extract entities from API responses
    const deal = dealData;
    const school = schoolData?.data;
    const lead = leadData?.data;
    const quote = quoteData?.data;

    // Determine school from various sources
    let resolvedSchool = school;
    if (!resolvedSchool && deal?.school) {
      resolvedSchool = deal.school as unknown as School;
    }
    if (!resolvedSchool && lead?.school) {
      resolvedSchool = lead.school;
    }

    // Get primary contact from school
    const primaryContact = resolvedSchool?.contacts?.find(
      (c) => c.is_primary
    );

    // Build client info
    let clientName = "";
    let clientEmail = "";
    let clientAddress = "";

    if (quote) {
      // If we have a quote, use its data
      clientName = quote.client_name;
      clientEmail = quote.client_email || "";
      clientAddress = quote.client_address || "";
    } else if (primaryContact) {
      // Use primary contact from school
      clientName = `${primaryContact.first_name || ""} ${primaryContact.last_name || ""}`.trim();
      clientEmail = primaryContact.email || "";
    } else if (lead?.primary_contact) {
      // Use lead's primary contact
      const leadContact = lead.primary_contact;
      clientName = `${leadContact.first_name || ""} ${leadContact.last_name || ""}`.trim();
      clientEmail = leadContact.email || "";
    }

    // Build address from school if not from quote
    if (!clientAddress && resolvedSchool) {
      const addressParts = [
        resolvedSchool.address,
        resolvedSchool.city,
        resolvedSchool.province,
      ].filter(Boolean);
      clientAddress = addressParts.join(", ");
    }

    // Extract items from deal or quote
    let items: DocumentItem[] | undefined;
    if (quote?.items) {
      // Use quote items
      items = quote.items.map((item) => ({
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: item.discount,
        tax_rate: item.tax_rate,
      }));
    } else if (deal?.quotes && deal.quotes.length > 0) {
      // Use items from the latest quote on the deal
      const latestQuote = deal.quotes[deal.quotes.length - 1];
      if (latestQuote?.items) {
        items = latestQuote.items.map((item) => ({
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount: item.discount,
          tax_rate: item.tax_rate,
        }));
      }
    }

    // Build notes
    let notes = "";
    if (quote?.notes) {
      notes = quote.notes;
    } else if (deal?.notes) {
      notes = deal.notes;
    } else if (lead?.notes) {
      notes = lead.notes;
    }

    // Determine if data is ready (all requested entities have loaded)
    const isReady = !isLoading;

    return {
      isReady,
      isLoading,
      school_id: resolvedSchool?.id,
      deal_id: deal?.id,
      person_id: personId || primaryContact?.id || lead?.primary_contact?.id,
      client_name: clientName,
      client_email: clientEmail,
      client_address: clientAddress,
      items,
      notes,
    };
  }, [
    dealData,
    schoolData,
    leadData,
    quoteData,
    isDealLoading,
    isSchoolLoading,
    isLeadLoading,
    isQuoteLoading,
    dealId,
    schoolId,
    leadId,
    quoteId,
    personId,
  ]);
}
