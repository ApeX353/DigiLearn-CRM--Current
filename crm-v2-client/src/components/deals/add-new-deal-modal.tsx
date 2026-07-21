import { useFormContext, useFieldArray } from "react-hook-form";
import Modal from "../ui/modal";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";
import type { Lead } from "~/api/leads";
import type { Product } from "~/api/products";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "~/lib/utils";
import { CalendarIcon, Check, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "../ui/calendar";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Slider } from "../ui/slider";
import { Toggle } from "../ui/toggle";
import { DocumentItems } from "../document-items";
import type { AddDealValues } from "~/api/deals";
import type { Pipeline, Stage } from "~/api/pipelines";
import type { User } from "~/stores/use-auth-store";

interface AddNewDealProps {
  onClose: () => void;
  onSubmit: (data: AddDealValues) => void;
  isPending: boolean;
  leads: Lead[];
  stages: Stage[];
  pipelines: Pipeline[];
  users: User[];
  products: Product[];
  isLoading: boolean;
  handleSearchProduct: (value: string) => void;
  searchValue: string;
  leadSearchValue: string;
  handleSearchLead: (value: string) => void;
  isLeadReadOnly?: boolean;
  isAssignedToReadOnly?: boolean;
  defaultUseItems?: boolean;
}

const AddNewDealModal: React.FC<AddNewDealProps> = ({
  onClose,
  onSubmit,
  isPending,
  leads,
  stages = [],
  pipelines = [],
  users,
  products,
  handleSearchProduct,
  searchValue,
  leadSearchValue,
  handleSearchLead,
  isLeadReadOnly = false,
  isAssignedToReadOnly = false,
  defaultUseItems = false,
}) => {
  const isOpen = useAddDealModalStore((state) => state.isOpen);
  const [isUsingItems, setUseItems] = useState(defaultUseItems);

  useEffect(() => {
    if (isOpen) {
      setUseItems(defaultUseItems);
    }
  }, [isOpen, defaultUseItems]);

  const form = useFormContext<AddDealValues>();

  const pipeline = form.watch("pipeline_id");

  const filteredStages = useMemo(() => {
    return stages.filter((stage) => stage.pipeline_id === pipeline);
  }, [pipeline, stages]);

  const {
    fields: competitorFields,
    append: appendCompetitor,
    remove: removeCompetitor,
  } = useFieldArray({
    control: form.control,
    name: "competitors",
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Deal"
      description="Add a new deal to your sales pipeline"
      size="lg"
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column - Main Deal Info */}
          <div className="md:col-span-2 space-y-4 border-r pr-6 border-border">
            <FormField
              control={form.control}
              name="lead_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead/Client *</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      const lead = leads.find((l) => l.id === value);
                      form.setValue("title", lead?.lead_name || "");
                    }}
                    value={field.value}
                    disabled={isLeadReadOnly}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select lead/client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <div className="mb-2">
                        <Input
                          placeholder="Search Lead"
                          value={leadSearchValue}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            handleSearchLead(e.target.value)
                          }
                        />
                      </div>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.lead_name}, {lead?.school?.name}
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Deal Title *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Enterprise Deal for Acme Corp"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the deal details..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <div>
                <Toggle
                  onClick={() => {
                    setUseItems(!isUsingItems);
                    form.setValue("items", []);
                  }}
                  aria-label="Toggle Use Items"
                  variant="outline"
                >
                  Use Items
                  {isUsingItems && <Check className="h-4 w-4" />}
                </Toggle>
                <p className="text-muted-foreground text-sm">
                  If you use item, value will be calculated based on the
                  products/ services added to the deal.
                </p>
              </div>
              {isUsingItems ? (
                <DocumentItems
                  products={products || []}
                  onSearch={handleSearchProduct}
                  productSearchTerm={searchValue}
                  showPaymentTerms
                />
              ) : (
                <div>
                  <FormField
                    control={form.control}
                    name="value"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deal Value*</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Deal Value"
                            value={field.value}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : "",
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Deal Metadata */}
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="pipeline_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pipelines.map((pipeline) => (
                        <SelectItem key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
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
              name="stage_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stage *</FormLabel>
                  <Select
                    onValueChange={(value: string) => {
                      field.onChange(value);
                      const stage = filteredStages.find(
                        (stage) => stage.id === value,
                      );
                      form.setValue(
                        "probability",
                        Number(stage?.probability) || 0,
                      );
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
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
              name="probability"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center">
                    <FormLabel>Probability: {field.value}%</FormLabel>
                    <span className="text-sm text-muted-foreground">
                      {field.value < 30
                        ? "Low"
                        : field.value < 70
                          ? "Medium"
                          : "High"}
                    </span>
                  </div>
                  <FormControl>
                    <Slider
                      disabled
                      min={0}
                      max={100}
                      step={5}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                      className="py-4"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expected_close_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Expected Close Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assigned_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned To</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isAssignedToReadOnly}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign to team member" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map((user, index) => (
                        <SelectItem key={index} value={user.id}>
                          {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium">Competitors</h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendCompetitor({
                      competitorName: "",
                      competitorStrength: 50,
                      status: "active",
                      ourAdvantage: "",
                      theirAdvantage: "",
                    })
                  }
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Competitor
                </Button>
              </div>

              <div className="space-y-2">
                {competitorFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-2 p-2 border rounded-md"
                  >
                    <FormField
                      control={form.control}
                      name={`competitors.${index}.competitorName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Competitor name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        Strength:{" "}
                        {form.watch(`competitors.${index}.competitorStrength`)}%
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeCompetitor(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <FormField
                      control={form.control}
                      name={`competitors.${index}.competitorStrength`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value || 0]}
                              onValueChange={(value) =>
                                field.onChange(value[0])
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Create Deal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddNewDealModal;
