import { useEffect, useMemo, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  addDealSchema,
  type AddDealValues,
  type CreateDealDto,
  useCreateDeal,
} from "~/api/deals";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { useLeads } from "~/api/leads";
import { usePipelines, usePipelineStages } from "~/api/pipelines";
import { useProducts } from "~/api/products";
import { useStaff } from "~/api/users";
import {
  useAddDealModalStore,
} from "~/stores/use-add-deal-modal-store";
import { useAuthStore } from "~/stores/use-auth-store";
import { useCurrency } from "~/hooks/use-currency";
import AddNewDealModal from "./add-new-deal-modal";

interface AddDealModalContainerProps {
  onDealCreated?: (leadId?: string) => void;
}

/** The shape Nest puts on the body of the 409 thrown by recording rule 6. */
interface DuplicateDealConflict {
  message: string;
  code: "DUPLICATE_OPEN_DEAL";
  existing_deal: { id: string; title: string; stage: string; value: number };
}

/**
 * Nest serialises ConflictException(object) with `code` and `existing_deal`
 * at the TOP level of the body, alongside `message` — not nested under it.
 */
const asDuplicateConflict = (err: unknown): DuplicateDealConflict | null => {
  const response = (err as { response?: { status?: number; data?: unknown } })
    ?.response;
  if (response?.status !== 409) return null;
  const data = response.data as DuplicateDealConflict | undefined;
  return data?.code === "DUPLICATE_OPEN_DEAL" ? data : null;
};

export default function AddDealModalContainer({
  onDealCreated,
}: AddDealModalContainerProps) {
  const { isOpen, initialValues, onClose } = useAddDealModalStore();

  const currentUser = useAuthStore((s) => s.user);
  const createDeal = useCreateDeal();
  // The deal form hardcoded "ZAR" in three places, inherited from the
  // original source (112c11a, 21 July) and never revisited. The business
  // runs in USD and every other surface reads the configured currency via
  // this hook, so new deals were being stamped rand while the rest of the
  // system said dollars. Nothing was ever converted — there is no FX code
  // anywhere — so the amounts were always right and only the label was
  // wrong, but it split reporting by currency and alarmed everyone who saw
  // it. Take the configured currency like everything else does.
  const { currency: configuredCurrency, formatCurrency } = useCurrency();

  const [leadSearch, setLeadSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const { data: leadsData } = useLeads({
    page: 1,
    limit: 50,
    search: leadSearch || undefined,
  });

  const { data: pipelinesData } = usePipelines();

  // Track selected pipeline for stage filtering
  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  const { data: stagesData } = usePipelineStages(selectedPipelineId);

  const { data: staffData } = useStaff({
    page: 1,
    limit: 100,
    status: "active",
  });

  const { data: productsData } = useProducts({
    page: 1,
    limit: 50,
    search: productSearch || undefined,
    is_active: true,
  });

  const leads = leadsData?.data || [];
  const pipelines = pipelinesData?.data || [];
  const allStages = stagesData?.data || [];
  const products = productsData?.data || [];

  // Map staff users to the User shape the modal expects
  const users = useMemo(
    () =>
      (staffData?.data || []).map((s) => ({
        id: s.id,
        email: s.email,
        first_name: s.first_name,
        last_name: s.last_name,
        roles: s.roles.map((r) => r.name),
        avatar_url: s.avatar_url || "",
      })),
    [staffData],
  );

  const hasItems = !!(initialValues?.items && initialValues.items.length > 0);

  const form = useForm<AddDealValues>({
    resolver: zodResolver(addDealSchema),
    defaultValues: {
      title: "",
      description: "",
      value: 0,
      currency: configuredCurrency,
      lead_id: "",
      stage_id: "",
      pipeline_id: "",
      probability: 0,
      expected_close_date: new Date(),
      assigned_to: currentUser?.id || "",
      competitors: [],
      items: [],
    },
  });

  // Watch pipeline_id to load stages
  const watchedPipelineId = form.watch("pipeline_id");
  useEffect(() => {
    if (watchedPipelineId) {
      setSelectedPipelineId(watchedPipelineId);
    }
  }, [watchedPipelineId]);

  // Native <select> trap: with no empty placeholder option the browser
  // RENDERS the first pipeline as selected while the form value is
  // still "" — so the Stage dropdown never loads until the user
  // re-picks the pipeline they appear to already have. Default the
  // form to the first pipeline once the list arrives.
  useEffect(() => {
    if (isOpen && pipelines.length > 0 && !form.getValues("pipeline_id")) {
      form.setValue("pipeline_id", pipelines[0].id);
    }
  }, [isOpen, pipelines, form]);

  // Reset form with initial values when the modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialValues) {
        form.reset({
          title: initialValues.title || "",
          description: initialValues.description || "",
          value: initialValues.value || 0,
          currency: configuredCurrency,
          lead_id: initialValues.lead_id || "",
          school_id: initialValues.school_id || "",
          stage_id: "",
          pipeline_id: "",
          probability: 0,
          expected_close_date: new Date(),
          assigned_to: initialValues.assigned_to || currentUser?.id || "",
          commercial_intent_reason: "",
          competitors: [],
          items: initialValues.items || [],
        });
      } else {
        form.reset({
          title: "",
          description: "",
          value: 0,
          currency: configuredCurrency,
          lead_id: "",
          stage_id: "",
          pipeline_id: "",
          probability: 0,
          expected_close_date: new Date(),
          assigned_to: currentUser?.id || "",
          commercial_intent_reason: "",
          competitors: [],
          items: [],
        });
      }
    }
  }, [isOpen, initialValues, currentUser?.id, form]);

  const [duplicateConflict, setDuplicateConflict] =
    useState<DuplicateDealConflict | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateDealDto | null>(
    null,
  );

  const submitPayload = (payload: CreateDealDto) => {
    createDeal.mutate(payload, {
      onSuccess: () => {
        toast.success("Deal created successfully");
        setDuplicateConflict(null);
        setPendingPayload(null);
        onClose();
        onDealCreated?.(initialValues?.lead_id);
      },
      onError: (err) => {
        // Recording rule 6: a school with an open deal is almost always the
        // rep about to duplicate it. Rather than a dead-end toast, show them
        // the deal that already exists and let them confirm a second order.
        const conflict = asDuplicateConflict(err);
        if (conflict) {
          setDuplicateConflict(conflict);
          setPendingPayload(payload);
          return;
        }
        // DEAL-GHOST1: surface the server's actual reason (e.g. the
        // commercial-intent gate's "the following are required first: …")
        // instead of a dead-end generic toast that hides what to fix.
        //
        // This read err.message, which on an axios rejection is the useless
        // "Request failed with status code 400" — so the gate's precise list
        // of what is missing never reached the rep. That is the "Error code
        // 400" on the Ruvheneko conversion ticket. The server's message is
        // on the response body, and NestJS sends an array for validation
        // errors and a string for a thrown BadRequestException.
        const body = (err as { response?: { data?: { message?: unknown } } })
          ?.response?.data?.message;
        const fromBody = Array.isArray(body)
          ? body.join("; ")
          : typeof body === "string"
            ? body
            : null;
        const msg =
          fromBody ??
          (err instanceof Error && err.message
            ? err.message
            : "Failed to create deal");
        toast.error(msg);
      },
    });
  };

  const handleSubmit = (data: AddDealValues) => submitPayload(data);

  /** The rep has seen the existing deal and confirmed a genuine second order. */
  const handleConfirmDuplicate = () => {
    if (pendingPayload) {
      submitPayload({ ...pendingPayload, duplicate_override: true });
    }
  };

  const handleClose = () => {
    form.reset();
    setDuplicateConflict(null);
    setPendingPayload(null);
    onClose();
  };

  return (
    <FormProvider {...form}>
      <AddNewDealModal
        onClose={handleClose}
        onSubmit={handleSubmit}
        isPending={createDeal.isPending}
        leads={leads}
        stages={allStages}
        pipelines={pipelines}
        users={users}
        products={products}
        isLoading={false}
        handleSearchProduct={setProductSearch}
        searchValue={productSearch}
        leadSearchValue={leadSearch}
        handleSearchLead={setLeadSearch}
        isLeadReadOnly={initialValues?.isLeadReadOnly}
        isAssignedToReadOnly={initialValues?.isAssignedToReadOnly}
        defaultUseItems={hasItems}
      />

      {/* Recording rule 6. The rep is shown the deal that already exists —
          title, stage and value — so "is this a second order?" is a question
          they can actually answer, rather than a 409 they have to guess at. */}
      <AlertDialog
        open={!!duplicateConflict}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateConflict(null);
            setPendingPayload(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This school already has an open deal</AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateConflict?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {duplicateConflict && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div className="font-medium">
                {duplicateConflict.existing_deal.title}
              </div>
              <div className="text-muted-foreground">
                {duplicateConflict.existing_deal.stage} ·{" "}
                {formatCurrency(duplicateConflict.existing_deal.value)}
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createDeal.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDuplicate}
              disabled={createDeal.isPending}
            >
              {createDeal.isPending
                ? "Creating…"
                : "Yes, create a second deal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
}
