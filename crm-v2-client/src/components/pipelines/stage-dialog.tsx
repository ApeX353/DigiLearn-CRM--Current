import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { stageFormSchema, useCreateStage, useUpdateStage, type Stage, type StageFormValues } from "~/api/pipelines";
import { toast } from "sonner";


interface StageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  stage?: Stage;
  nextOrder: number;
}

export function StageDialog({ open, onOpenChange, pipelineId, stage, nextOrder }: StageDialogProps) {
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StageFormValues>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: stage
      ? {
          name: stage.name,
          sla_days: stage.sla_days,
          probability: stage.probability,
          color: stage.color,
          description: stage.description || "",
        }
      : {
          name: "",
          sla_days: 7,
          probability: 0,
          color: "#6366f1",
          description: "",
        },
  });

  const onSubmit = async (values: StageFormValues) => {
    setIsSubmitting(true);
    try {
      if (stage) {
        // Update existing stage
        await updateStage.mutateAsync({
          pipelineId,
          stageId: stage.id,
          data: values,
        });
        toast.success("Stage updated successfully");
      } else {
        // Create new stage
        await createStage.mutateAsync({
          pipelineId,
          data: {
            ...values,
            order: nextOrder,
          },
        });
        toast.success("Stage created successfully");
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast.error(stage ? "Failed to update stage" : "Failed to create stage");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{stage ? "Edit Stage" : "Add Stage"}</DialogTitle>
          <DialogDescription>
            {stage ? "Update the pipeline stage details" : "Create a new pipeline stage"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Discovery" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sla_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Days</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probability %</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input type="color" className="w-20 h-10" {...field} />
                    </FormControl>
                    <Input 
                      type="text" 
                      placeholder="#6366f1" 
                      value={field.value}
                      onChange={field.onChange}
                      className="flex-1"
                    />
                  </div>
                  <FormDescription>
                    Choose a color for this stage
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief description of this stage" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  form.reset();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : stage ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
