import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  addDealSchema,
  type AddDealValues,
  type CreateDealDto,
  useCreateDeal,
} from "~/api/deals";
import { useLeads } from "~/api/leads";
import { usePipelines, usePipelineStages } from "~/api/pipelines";
import { useProducts } from "~/api/products";
import { useStaff } from "~/api/users";
import {
  useAddDealModalStore,
} from "~/stores/use-add-deal-modal-store";
import { useAuthStore } from "~/stores/use-auth-store";
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
import AddNewDealModal from "./add-new-deal-modal";

interface AddDealModalContainerProps {
  onDealCreated?: (leadId?: string) => void;
}

/** Shape of the 409 the server raises for rule 6 (one order, one deal). */
interface DuplicateDealConflict {
  message: string;
  code?: string;
  existing_deal?: { id: string; title: string; stage: string; value: number };
}

const readDuplicateConflict = (
  error: unknown,
): DuplicateDealConflict | null => {
  const response = (error as { response?: { status?: number; data?: any } })
    ?.response;
  if (response?.status !== 409) return null;
  // Nest serializes ConflictException(object) with `code`/`existing_deal`
  // at the top level of the body, alongside `message`.
  if (response.data?.code === "DUPLICATE_OPEN_DEAL") return response.data;
  return null;
};

export default function AddDealModalContainer({
  onDealCreated,
}: AddDealModalContainerProps) {
  const { isOpen, initialValues, onClose } = useAddDealModalStore();

  const currentUser = useAuthStore((s) => s.user);
  const createDeal = useCreateDeal();

  const [leadSearch, setLeadSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [duplicateConflict, setDuplicateConflict] =
    useState<DuplicateDealConflict | null>(null);
  const [pendingPayload, setPendingPayload] = useState<CreateDealDto | null>(
    null,
  );

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

  const { data: productsData, isLoading: isProductsLoading } = useProducts({
    page: 1,
    limit: 100,
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
      product_id: "",
      quantity: 1,
      description: "",
      value: 0,
      currency: "ZAR",
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

  // Recording rule 2: the title is composed, never typed. Product names
  // already carry the size ("85 Inch Interactive Board"), so
  // "<qty> × <name>" says everything a report needs to find the deal.
  // The picked product's name is cached so an active catalogue search
  // (which narrows `products`) can't blank an already-generated title.
  const watchedProductId = form.watch("product_id");
  const watchedQuantity = form.watch("quantity");
  // Name AND price are cached on pick. `products` is the *search* result
  // list, so once the rep types in the catalogue search box the picked
  // product drops out of it — reading price from the live list would
  // silently stop the value tracking quantity.
  const [picked, setPicked] = useState<{ name: string; price: number } | null>(
    null,
  );
  useEffect(() => {
    if (!watchedProductId) return;
    const found = products.find((p) => p.id === watchedProductId);
    if (found && found.name !== picked?.name) {
      setPicked({ name: found.name, price: Number(found.price) || 0 });
    }
    const source = found
      ? { name: found.name, price: Number(found.price) || 0 }
      : picked;
    if (!source) return;

    const qty = Number(watchedQuantity) >= 1 ? Number(watchedQuantity) : 1;
    const composed = `${qty} × ${source.name}`;
    if (form.getValues("title") !== composed) {
      form.setValue("title", composed, { shouldValidate: true });
    }
    // Prefill the value from the catalogue only when the field is still
    // empty. A value carried in from the lead's estimated value (or one
    // the rep typed) must never be silently overwritten by list price —
    // on the convert path that quietly replaced a real negotiated figure.
    const currentValue = Number(form.getValues("value")) || 0;
    if (source.price > 0 && currentValue === 0) {
      form.setValue("value", qty * source.price);
    }
  }, [watchedProductId, watchedQuantity, products, picked, form]);

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
      setDuplicateConflict(null);
      setPendingPayload(null);
      setPicked(null);
      if (initialValues) {
        form.reset({
          title: initialValues.title || "",
          product_id: initialValues.product_id || "",
          quantity: initialValues.quantity || 1,
          description: initialValues.description || "",
          value: initialValues.value || 0,
          currency: "ZAR",
          lead_id: initialValues.lead_id || "",
          school_id: initialValues.school_id || "",
          stage_id: "",
          pipeline_id: "",
          probability: 0,
          expected_close_date: new Date(),
          assigned_to: initialValues.assigned_to || currentUser?.id || "",
          competitors: [],
          items: initialValues.items || [],
        });
      } else {
        form.reset({
          title: "",
          product_id: "",
          quantity: 1,
          description: "",
          value: 0,
          currency: "ZAR",
          lead_id: "",
          stage_id: "",
          pipeline_id: "",
          probability: 0,
          expected_close_date: new Date(),
          assigned_to: currentUser?.id || "",
          competitors: [],
          items: [],
        });
      }
    }
  }, [isOpen, initialValues, currentUser?.id, form]);

  const submitPayload = (payload: CreateDealDto) => {
    createDeal.mutate(payload as AddDealValues, {
      onSuccess: () => {
        toast.success("Deal created successfully");
        setDuplicateConflict(null);
        setPendingPayload(null);
        onClose();
        onDealCreated?.(initialValues?.lead_id);
      },
      onError: (error) => {
        const conflict = readDuplicateConflict(error);
        if (conflict) {
          // Rule 6: show the rep the school's existing open deal and make
          // "create another" an explicit decision, not an accident.
          setDuplicateConflict(conflict);
          setPendingPayload(payload);
          return;
        }
        // DEAL-GHOST1: surface the server's actual reason (e.g. the
        // commercial-intent gate's "the following are required first: …")
        // instead of a dead-end generic toast that hides what to fix.
        // Read the response body first — an axios error's own .message is
        // only "Request failed with status code 400" — then fall back to it.
        const message = (
          error as { response?: { data?: { message?: string | string[] } } }
        )?.response?.data?.message;
        toast.error(
          Array.isArray(message)
            ? message[0]
            : message ||
                (error instanceof Error && error.message
                  ? error.message
                  : "Failed to create deal"),
        );
      },
    });
  };

  const handleSubmit = (data: AddDealValues) => {
    // product_id/quantity composed the title; the API whitelist rejects
    // unknown properties, so they stay behind.
    const { product_id: _product, quantity: _qty, ...payload } = data;
    submitPayload(payload);
  };

  const handleConfirmDuplicate = () => {
    if (pendingPayload) {
      submitPayload({ ...pendingPayload, duplicate_override: true });
    }
  };

  const handleClose = () => {
    form.reset();
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
        initialSchoolName={initialValues?.school_name}
        productsLoading={isProductsLoading}
      />
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
            <AlertDialogTitle>
              This school already has an open deal
            </AlertDialogTitle>
            <AlertDialogDescription>
              {duplicateConflict?.existing_deal ? (
                <>
                  <span className="font-medium text-foreground">
                    {duplicateConflict.existing_deal.title}
                  </span>{" "}
                  is already in {duplicateConflict.existing_deal.stage} at $
                  {duplicateConflict.existing_deal.value.toLocaleString(
                    "en-US",
                  )}
                  . One order means one deal — only continue if the school is
                  genuinely placing a second order.
                </>
              ) : (
                duplicateConflict?.message
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {duplicateConflict?.existing_deal?.id && (
              <AlertDialogAction asChild>
                <Link
                  to={`/deals/${duplicateConflict.existing_deal.id}`}
                  onClick={() => {
                    setDuplicateConflict(null);
                    setPendingPayload(null);
                    onClose();
                  }}
                >
                  Open the existing deal
                </Link>
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={handleConfirmDuplicate}>
              It's a second order — create it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormProvider>
  );
}
