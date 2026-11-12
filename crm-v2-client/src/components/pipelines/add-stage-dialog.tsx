import { useState, useEffect, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Modal from "~/components/ui/modal";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  useCreateStage,
  useUpdateStage,
  usePipelines,
  stageFormSchema,
} from "~/api/pipelines";
import { toast } from "sonner";
import { Sketch } from "@uiw/react-color";
import { usePipelineStageStore } from "~/stores/pipeline-stage-store";

// Helper to convert HSL string to color object
function parseHslString(
  hslString: string,
): { h: number; s: number; l: number } | null {
  const match = hslString.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (match) {
    return {
      h: parseInt(match[1]),
      s: parseInt(match[2]),
      l: parseInt(match[3]),
    };
  }
  return null;
}

// Helper to convert HSL to HEX
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Helper to convert HEX to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0,
    l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

const stageFormWithPipelineSchema = stageFormSchema.extend({
  pipeline_id: z.string().min(1, "Please select a pipeline"),
});

type StageFormWithPipelineValues = z.infer<typeof stageFormWithPipelineSchema>;

export function AddStageDialog() {
  const { stageDialog, closeStageDialog } = usePipelineStageStore();
  const { data: pipelinesData } = usePipelines();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pipelines = pipelinesData?.data || [];

  // Convert hex to hsl for display
  const getHslString = (hexColor: string): string => {
    const hsl = hexToHsl(hexColor);
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  };

  const form = useForm<StageFormWithPipelineValues>({
    resolver: zodResolver(stageFormWithPipelineSchema),
    defaultValues: {
      pipeline_id: "",
      name: "",
      sla_days: 7,
      probability: 0,
      color: "hsl(220, 70%, 50%)",
      order: stageDialog.nextOrder,
    },
  });

  // Update form when stage changes
  useEffect(() => {
    if (stageDialog.stage) {
      form.reset({
        pipeline_id: stageDialog.stage.pipeline_id,
        name: stageDialog.stage.name,
        sla_days: stageDialog.stage.sla_days,
        probability: stageDialog.stage.probability,
        color: getHslString(stageDialog.stage.color),
      });
    } else if (stageDialog.pipelineId) {
      form.reset({
        pipeline_id: stageDialog.pipelineId,
        name: "",
        sla_days: 7,
        probability: 0,
        color: "hsl(220, 70%, 50%)",
      });
    } else {
      form.reset({
        pipeline_id: "",
        name: "",
        sla_days: 7,
        probability: 0,
        color: "hsl(220, 70%, 50%)",
      });
    }
  }, [stageDialog.stage, stageDialog.pipelineId, form]);

  const onSubmit = async (values: StageFormWithPipelineValues) => {
    setIsSubmitting(true);
    try {
      // Convert HSL to HEX before sending to API
      const hsl = parseHslString(values.color);
      const hexColor = hsl ? hslToHex(hsl.h, hsl.s, hsl.l) : "#6366f1";

      if (stageDialog.stage) {
        // Update existing stage
        await updateStage.mutateAsync({
          pipelineId: values.pipeline_id,
          stageId: stageDialog.stage.id,
          data: {
            name: values.name,
            sla_days: values.sla_days,
            probability: values.probability,
            color: hexColor,
          },
        });
        toast.success("Stage updated successfully");
      } else {
        // Create new stage
        await createStage.mutateAsync({
          pipelineId: values.pipeline_id,
          data: {
            name: values.name,
            sla_days: values.sla_days,
            probability: values.probability,
            color: hexColor,
            order: stageDialog.nextOrder,
          },
        });
        toast.success("Stage created successfully");
      }
      closeStageDialog();
      form.reset();
    } catch (error) {
      toast.error(
        stageDialog.stage ? "Failed to update stage" : "Failed to create stage",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get the current color in HEX format for the color picker
  const getCurrentHexColor = (): string => {
    const hsl = parseHslString(form.watch("color"));
    return hsl ? hslToHex(hsl.h, hsl.s, hsl.l) : "#6366f1";
  };

  // Handle color picker change
  const handleColorChange = (color: any) => {
    const hex = color.hex;
    const hslString = getHslString(hex);
    form.setValue("color", hslString);
  };

  return (
    <Modal
      isOpen={stageDialog.isOpen}
      onClose={closeStageDialog}
      title={stageDialog.stage ? "Edit Stage" : "Add Stage"}
      description={
        stageDialog.stage
          ? "Update the pipeline stage details"
          : "Create a new pipeline stage"
      }
      size="sm"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="pipeline_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Pipeline</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a pipeline" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id}>
                        {pipeline.name} {pipeline.is_default && "(Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

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

          <div className="grid grid-cols-2 gap-4 items-start">
            <FormField
              control={form.control}
              name="sla_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SLA Days</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      value={field.value}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        field.onChange(parseInt(e.target.value))
                      }
                    />
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
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={field.value}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        field.onChange(parseInt(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 items-start">
            <FormField
              control={form.control}
              name="order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      value={field.value}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        field.onChange(parseInt(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="hsl(220, 70%, 50%)"
                        className="flex-1"
                        {...field}
                      />
                    </FormControl>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          className="w-16 h-10 p-0 border border-input"
                          style={{ backgroundColor: getCurrentHexColor() }}
                        >
                          <span className="sr-only">Pick color</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Sketch
                          color={getCurrentHexColor()}
                          onChange={handleColorChange}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                closeStageDialog();
                form.reset();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : stageDialog.stage
                  ? "Update"
                  : "Create"}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}
