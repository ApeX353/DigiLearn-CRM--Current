import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Separator } from "~/components/ui/separator";
import {
  Loader2,
  FileText,
  ListTodo,
  Phone,
  Mail,
  Calendar,
  MessageCircle,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import { useCreateActivity } from "~/api/activities";
import {
  type ActivityType,
  type ActivityOutcome,
  type CallOutcome,
  type CreateActivityDto,
} from "~/api/activities/types";
import type { Contact } from "~/api/contacts";
import { LeadDealPicker } from "./lead-deal-picker";
import { PersonPicker } from "./person-picker";
import {
  NoteTabForm,
  TaskTabForm,
  CallTabForm,
  EmailTabForm,
  MeetingTabForm,
  WhatsAppTabForm,
  DemoTabForm,
} from "./activity-tab-forms";
import type { TabFormHandle } from "./activity-tab-forms/types";

interface CreateActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string;
  dealId?: string;
  defaultType?: ActivityType;
  isReadonly?: boolean;
}

/**
 * The visible tabs in the modal. Demo activities (DEMO_BOOKING,
 * DEMO_DELIVERY, DEMO_FOLLOWUP) collapse into a single "demo"
 * umbrella tab so the row stays scannable; the actual subtype is
 * picked inside the Demo form. The submit handler reads
 * `__demoType` from the form payload and writes it to
 * CreateActivityDto.type.
 */
const VISIBLE_TABS = [
  "note",
  "task",
  "call",
  "email",
  "meeting",
  "whatsapp",
  "demo",
] as const;
type VisibleTab = (typeof VISIBLE_TABS)[number];

const ACTIVITY_ICONS: Record<VisibleTab, React.ReactNode> = {
  note: <FileText className="h-4 w-4" />,
  task: <ListTodo className="h-4 w-4" />,
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
  demo: <Sparkles className="h-4 w-4" />,
};

const ACTIVITY_LABELS: Record<VisibleTab, string> = {
  note: "Note",
  task: "Task",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
  demo: "Demo",
};

const ACTIVITY_HELP_TEXT: Record<VisibleTab, string> = {
  note: "Notes capture context only. They do not satisfy next-action, SLA, or hygiene requirements.",
  task: "Tasks are actionable next steps and need a due date.",
  call: "Calls should record the person contacted, outcome, and next step.",
  email: "Emails should record the recipient, message, and any follow-up owed.",
  meeting: "Meetings should capture attendees, timing, and the planned outcome.",
  whatsapp: "WhatsApp activity should record the recipient and message context.",
  demo: "Demo activity feeds demo booking, completion, and follow-up discipline.",
};

const SINGLE_CONTACT_TYPES: VisibleTab[] = ["call", "whatsapp"];
const MULTI_CONTACT_TYPES: VisibleTab[] = ["email", "meeting"];

const MULTI_LABELS: Partial<Record<VisibleTab, string>> = {
  email: "Recipients",
  meeting: "Attendees",
};

export function CreateActivityModal({
  isOpen,
  onClose,
  leadId: initialLeadId,
  dealId: initialDealId,
  defaultType = "note",
  isReadonly = false,
}: CreateActivityModalProps) {
  // Visible-tab state. Demo subtypes collapse to the "demo" tab; the
  // actual ActivityType for the outgoing payload is derived at submit
  // time from either activeType (for non-demo) or
  // tabPayload.__demoType (for demo).
  const [activeType, setActiveType] = useState<VisibleTab>(
    (VISIBLE_TABS as readonly string[]).includes(defaultType)
      ? (defaultType as VisibleTab)
      : "note",
  );
  const createMutation = useCreateActivity();
  const tabFormRef = useRef<TabFormHandle>(null);

  // Entity selection
  const [leadId, setLeadId] = useState<string | undefined>(initialLeadId);
  const [dealId, setDealId] = useState<string | undefined>(initialDealId);

  // Single contact selection (call/whatsapp)
  const [contactId, setContactId] = useState<string | undefined>(undefined);
  const [selectedContact, setSelectedContact] = useState<Contact | undefined>(
    undefined,
  );

  // Multi contact selection (email/meeting)
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);

  // Action data from active tab (for action buttons)
  const [actionData, setActionData] = useState<Record<string, string>>({});

  // Reset on modal open/close
  useEffect(() => {
    if (isOpen) {
      setActiveType(
        (VISIBLE_TABS as readonly string[]).includes(defaultType)
          ? (defaultType as VisibleTab)
          : "note",
      );
      setLeadId(initialLeadId);
      setDealId(initialDealId);
      setContactId(undefined);
      setSelectedContact(undefined);
      setSelectedContactIds([]);
      setSelectedContacts([]);
      setActionData({});
    }
  }, [isOpen, defaultType, initialLeadId, initialDealId]);

  const handleTypeChange = (type: string) => {
    if (isReadonly) {
      return;
    }
    setActiveType(type as VisibleTab);
    setActionData({});
  };

  const handleContactSelect = (id: string | undefined, contact?: Contact) => {
    setContactId(id);
    setSelectedContact(contact);
  };

  const handleMultiContactSelect = (
    contactIds: string[],
    contacts: Contact[],
  ) => {
    setSelectedContactIds(contactIds);
    setSelectedContacts(contacts);
  };

  const handleActionDataChange = useCallback((data: Record<string, string>) => {
    setActionData(data);
  }, []);

  const hasEntity = !!(leadId || initialLeadId || dealId || initialDealId);
  const showEntityPicker = !initialLeadId && !initialDealId;
  const needsSingleContact = SINGLE_CONTACT_TYPES.includes(activeType);
  const needsMultiContact = MULTI_CONTACT_TYPES.includes(activeType);
  const effectiveLeadId = leadId || initialLeadId;
  const effectiveDealId = dealId || initialDealId;

  const handleSubmit = async () => {
    if (isReadonly) {
      toast.error("This record is read-only");
      return;
    }

    if (!hasEntity && showEntityPicker) {
      toast.error("Select a lead or deal first", {
        description: "Activities must belong to a CRM record so timelines, SLA, and reports stay in sync.",
      });
      return;
    }

    if (
      activeType === "email" &&
      !selectedContacts.some((contact) => contact.email?.trim())
    ) {
      toast.error("Select a recipient with an email address");
      return;
    }

    const isValid = await tabFormRef.current?.trigger();
    if (!isValid) {
      toast.error(`Complete the required ${ACTIVITY_LABELS[activeType]} fields`, {
        description: ACTIVITY_HELP_TEXT[activeType],
      });
      return;
    }

    const tabPayload = tabFormRef.current!.getValues();

    // For the umbrella "demo" tab, the actual ActivityType comes from
    // the subtype the user picked inside the form (booking / delivery
    // / followup). For all other tabs, activeType IS the type.
    const resolvedType: ActivityType =
      activeType === "demo"
        ? ((tabPayload.__demoType ?? "demo_booking") as ActivityType)
        : (activeType as ActivityType);

    // Calls, WhatsApps and emails logged through this modal have
    // ALREADY happened (the call form requires an outcome, the email
    // is sent on save). Without `status: completed` they were created
    // as `scheduled`, which (a) hid them from the Activity log feed —
    // completed items + notes only — so reps thought their logged call
    // vanished, and (b) never advanced the lead's `last_contacted_at`.
    // Tasks, meetings and demo bookings remain scheduled future work.
    //
    // A call/WhatsApp logged through THIS modal has already happened: the
    // call form requires an outcome, the WhatsApp is a message just sent.
    // These forms put the FOLLOW-UP date into `due_at` (the next step, also
    // carried on call/whatsapp.follow_up_date, which is what spawns the open
    // follow-up task server-side). So a future `due_at` here means "follow up
    // later", NOT "this interaction is scheduled for the future" — the earlier
    // NEXT3 check read it the second way and so left the activity `scheduled`,
    // which never marked the lead Contacted. Treat them as logged (completed);
    // the follow-up task still appears as the next step.
    const isLoggedInteraction =
      resolvedType === "email" ||
      resolvedType === "call" ||
      resolvedType === "whatsapp";

    // A completed create must carry an outcome and an account of what happened
    // whenever compliance.policy.enforce_outcome_on_completion is on — which it
    // is on production. This modal logs calls, emails and WhatsApps as
    // already-completed and has never sent either field, so every one of them
    // would come back 400 once that check ships.
    //
    // Nothing is invented here. The tab schemas already force the rep to give
    // us both: the call tab REQUIRES an outcome and a summary, the email tab
    // requires a body, the WhatsApp tab requires a message. This maps what they
    // typed onto the two fields the server asks for.
    const CALL_OUTCOME_TO_COMPLETION: Record<CallOutcome, ActivityOutcome> = {
      answered: "successful",
      no_answer: "no_response",
      busy: "no_response",
      voicemail: "no_response",
      wrong_number: "unsuccessful",
      callback_requested: "follow_up_needed",
    };

    // An email or WhatsApp that went out IS a successful interaction, so
    // "successful" is the honest reading rather than a placeholder. It is also
    // deliberately a PIPELINE outcome: every RELATIONSHIP outcome
    // (information_shared and friends) is treated as relationship-terminal by
    // the next-step gate, so defaulting there would quietly exempt every logged
    // email from the compliance rule this deploy is meant to tighten.
    const loggedOutcome: ActivityOutcome | undefined = !isLoggedInteraction
      ? undefined
      : resolvedType === "call"
        ? CALL_OUTCOME_TO_COMPLETION[
            (tabPayload.call?.outcome ?? "answered") as CallOutcome
          ]
        : "successful";

    const loggedNote = !isLoggedInteraction
      ? undefined
      : tabPayload.call?.summary ||
        tabPayload.whatsapp?.message ||
        tabPayload.email?.body ||
        tabPayload.description ||
        tabPayload.subject;

    const payload: CreateActivityDto = {
      type: resolvedType,
      ...(isLoggedInteraction && {
        status: "completed" as const,
        completion_outcome: loggedOutcome,
        completion_note: loggedNote,
      }),
      subject: tabPayload.subject,
      lead_id: effectiveLeadId,
      deal_id: effectiveDealId,
      contact_id: contactId,
      due_at: tabPayload.due_at,
      description: tabPayload.description,
      assigned_to_id: tabPayload.assigned_to_id,
      duration: tabPayload.duration,
      note: tabPayload.note,
      task: tabPayload.task,
      call: tabPayload.call,
      email: tabPayload.email,
      meeting: tabPayload.meeting,
      whatsapp: tabPayload.whatsapp,
      demo: tabPayload.demo,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(
          activeType === "email"
            ? "Email sent and saved"
            : "Activity created successfully",
        );
        onClose();
      },
      onError: (error) => {
        toast.error("Could not create activity", {
          description: handleApiError(error),
        });
      },
    });
  };

  // Action button helpers
  const handleStartCall = () => {
    const phone = actionData.phone_number;
    if (phone) window.open(`tel:${phone}`, "_self");
  };

  const handleOpenWhatsApp = () => {
    const phone = actionData.phone_number;
    if (phone) {
      const msg = actionData.message || "";
      const url = `https://wa.me/${phone.replace(/[^0-9]/g, "")}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;
      window.open(url, "_blank");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Activity" size="lg">
      <div className="space-y-6">
        <Tabs value={activeType} onValueChange={handleTypeChange}>
          <TabsList className="grid h-auto grid-cols-4 w-full sm:grid-cols-7">
            {VISIBLE_TABS.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                className="flex min-h-9 items-center gap-1 text-xs"
                disabled={isReadonly}
                data-testid={`activity-tab-${type}`}
              >
                {ACTIVITY_ICONS[type]}
                <span className="hidden sm:inline">
                  {ACTIVITY_LABELS[type]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {ACTIVITY_HELP_TEXT[activeType]}
          </p>

          <div className="mt-4 space-y-4">
            {/* Entity Picker */}
            {showEntityPicker && (
              <>
                <LeadDealPicker
                  leadId={leadId}
                  dealId={dealId}
                  onLeadChange={setLeadId}
                  onDealChange={setDealId}
                />
                <Separator />
              </>
            )}

            {/* Single-select Person Picker (call/whatsapp) */}
            {needsSingleContact && (
              <PersonPicker
                leadId={effectiveLeadId}
                dealId={effectiveDealId}
                value={contactId}
                onChange={handleContactSelect}
              />
            )}

            {/* Multi-select Person Picker (email/meeting) */}
            {needsMultiContact && (
              <PersonPicker
                mode="multi"
                label={MULTI_LABELS[activeType]}
                leadId={effectiveLeadId}
                dealId={effectiveDealId}
                values={selectedContactIds}
                onMultiChange={handleMultiContactSelect}
              />
            )}

            <TabsContent value="note" className="mt-0">
              <NoteTabForm ref={tabFormRef} />
            </TabsContent>

            <TabsContent value="task" className="mt-0">
              <TaskTabForm ref={tabFormRef} />
            </TabsContent>

            <TabsContent value="call" className="mt-0">
              <CallTabForm
                ref={tabFormRef}
                selectedContact={selectedContact}
                onActionDataChange={handleActionDataChange}
              />
            </TabsContent>

            <TabsContent value="email" className="mt-0">
              <EmailTabForm
                ref={tabFormRef}
                selectedContacts={selectedContacts}
                onActionDataChange={handleActionDataChange}
                leadId={effectiveLeadId}
                dealId={effectiveDealId}
              />
            </TabsContent>

            <TabsContent value="meeting" className="mt-0">
              <MeetingTabForm
                ref={tabFormRef}
                selectedContacts={selectedContacts}
              />
            </TabsContent>

            <TabsContent value="whatsapp" className="mt-0">
              <WhatsAppTabForm
                ref={tabFormRef}
                selectedContact={selectedContact}
                onActionDataChange={handleActionDataChange}
              />
            </TabsContent>

            <TabsContent value="demo" className="mt-0">
              <DemoTabForm ref={tabFormRef} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          {activeType === "call" && actionData.phone_number && (
            <Button
              type="button"
              variant="outline"
              onClick={handleStartCall}
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              Start Call
            </Button>
          )}
          {activeType === "whatsapp" && actionData.phone_number && (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenWhatsApp}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Open WhatsApp
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createMutation.isPending || isReadonly}
            className="flex-1"
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {isReadonly
              ? "Read only"
              : activeType === "email"
                ? "Send email"
                : `Save ${ACTIVITY_LABELS[activeType]}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
