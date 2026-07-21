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
} from "lucide-react";
import { toast } from "sonner";
import { useCreateActivity } from "~/api/activities";
import {
  ACTIVITY_TYPES,
  type ActivityType,
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

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  note: <FileText className="h-4 w-4" />,
  task: <ListTodo className="h-4 w-4" />,
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  whatsapp: <MessageCircle className="h-4 w-4" />,
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: "Note",
  task: "Task",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  whatsapp: "WhatsApp",
};

const SINGLE_CONTACT_TYPES: ActivityType[] = ["call", "whatsapp"];
const MULTI_CONTACT_TYPES: ActivityType[] = ["email", "meeting"];

const MULTI_LABELS: Partial<Record<ActivityType, string>> = {
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
  const [activeType, setActiveType] = useState<ActivityType>(defaultType);
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
      setActiveType(defaultType);
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
    setActiveType(type as ActivityType);
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
      toast.error("Please select a lead or deal");
      return;
    }

    const isValid = await tabFormRef.current?.trigger();
    if (!isValid) {
      toast.error("Please fill in all required fields");
      return;
    }

    const tabPayload = tabFormRef.current!.getValues();

    const payload: CreateActivityDto = {
      type: activeType,
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
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("Activity created successfully");
        onClose();
      },
      onError: () => {
        toast.error("Failed to create activity");
      },
    });
  };

  // Action button helpers
  const handleStartCall = () => {
    const phone = actionData.phone_number;
    if (phone) window.open(`tel:${phone}`, "_self");
  };

  const handleOpenEmail = () => {
    const to = actionData.to_recipients;
    if (to) {
      const subject = actionData.subject || "";
      const body = actionData.body || "";
      const cc = actionData.cc_recipients || "";
      const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${cc ? `&cc=${encodeURIComponent(cc)}` : ""}`;
      window.open(mailto, "_blank");
    }
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
          <TabsList className="grid grid-cols-6 w-full">
            {ACTIVITY_TYPES.map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                className="flex items-center gap-1 text-xs"
                disabled={isReadonly}
              >
                {ACTIVITY_ICONS[type]}
                <span className="hidden sm:inline">
                  {ACTIVITY_LABELS[type]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

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
          </div>
        </Tabs>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
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
          {activeType === "email" && actionData.to_recipients && (
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenEmail}
              className="gap-2"
            >
              <Mail className="h-4 w-4" />
              Send Email
              <ExternalLink className="h-3 w-3" />
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
            onClick={handleSubmit}
            disabled={createMutation.isPending || isReadonly}
            className="flex-1"
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {isReadonly ? "Read only" : `Save ${ACTIVITY_LABELS[activeType]}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
