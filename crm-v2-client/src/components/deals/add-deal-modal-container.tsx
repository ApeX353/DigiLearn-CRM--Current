import { useEffect, useMemo, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { addDealSchema, type AddDealValues, useCreateDeal } from "~/api/deals";
import { useLeads } from "~/api/leads";
import { usePipelines, usePipelineStages } from "~/api/pipelines";
import { useProducts } from "~/api/products";
import { useStaff } from "~/api/users";
import {
  useAddDealModalStore,
} from "~/stores/use-add-deal-modal-store";
import { useAuthStore } from "~/stores/use-auth-store";
import AddNewDealModal from "./add-new-deal-modal";

interface AddDealModalContainerProps {
  onDealCreated?: (leadId?: string) => void;
}

export default function AddDealModalContainer({
  onDealCreated,
}: AddDealModalContainerProps) {
  const { isOpen, initialValues, onClose } = useAddDealModalStore();

  const currentUser = useAuthStore((s) => s.user);
  const createDeal = useCreateDeal();

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

  const handleSubmit = (data: AddDealValues) => {
    createDeal.mutate(data, {
      onSuccess: () => {
        toast.success("Deal created successfully");
        onClose();
        onDealCreated?.(initialValues?.lead_id);
      },
      onError: (err) => {
        // DEAL-GHOST1: surface the server's actual reason (e.g. the
        // commercial-intent gate's "the following are required first: …")
        // instead of a dead-end generic toast that hides what to fix.
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Failed to create deal";
        toast.error(msg);
      },
    });
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
      />
    </FormProvider>
  );
}
