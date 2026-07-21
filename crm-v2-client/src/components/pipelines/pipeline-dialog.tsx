import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Modal from "~/components/ui/modal";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import {
  createPipelineSchema,
  useCreatePipeline,
  useUpdatePipeline,
  type CreatePipelineValues,
} from "~/api/pipelines";
import { toast } from "sonner";
import { usePipelineStageStore } from "~/stores/pipeline-stage-store";

export function PipelineDialog() {
  const { pipelineDialog, closePipelineDialog } = usePipelineStageStore();
  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();

  const form = useForm<CreatePipelineValues>({
    resolver: zodResolver(createPipelineSchema),
    defaultValues: {
      name: "",
      is_default: false,
    },
  });

  // Update form when pipeline changes
  useEffect(() => {
    if (pipelineDialog.pipeline) {
      form.reset({
        name: pipelineDialog.pipeline.name,
        is_default: pipelineDialog.pipeline.is_default,
      });
    } else {
      form.reset({
        name: "",
        is_default: false,
      });
    }
  }, [pipelineDialog.pipeline, form]);

  const onSubmit = async (values: CreatePipelineValues) => {
    try {
      if (pipelineDialog.pipeline) {
        // Update existing pipeline
        await updatePipeline.mutateAsync({
          id: pipelineDialog.pipeline.id,
          data: values,
        });
        toast.success("Pipeline updated successfully");
      } else {
        // Create new pipeline
        await createPipeline.mutateAsync(values);
        toast.success("Pipeline created successfully");
      }
      closePipelineDialog();
      form.reset();
    } catch (error) {
      toast.error(
        pipelineDialog.pipeline
          ? "Failed to update pipeline"
          : "Failed to create pipeline",
      );
    }
  };

  return (
    <Modal
      isOpen={pipelineDialog.isOpen}
      onClose={closePipelineDialog}
      title={pipelineDialog.pipeline ? "Edit Pipeline" : "Add Pipeline"}
      description={
        pipelineDialog.pipeline
          ? "Update the pipeline details"
          : "Create a new pipeline"
      }
      size="sm"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pipeline Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Sales Pipeline" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="is_default"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Set as Default</FormLabel>
                  <FormDescription>
                    Make this the default pipeline for new deals
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closePipelineDialog();
                form.reset();
              }}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving..."
                : pipelineDialog.pipeline
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
