import { forwardRef, useImperativeHandle, useState } from "react";
import { useForm } from "react-hook-form";
import { Calendar, ListCheck, MessageCircle, Sparkles } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { DateTimePicker } from "~/components/ui/date-picker";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from "~/components/ui/form";
import type {
  ActivityTabFormProps,
  TabFormHandle,
  TabFormPayload,
} from "./types";

/**
 * Single Demo tab form. The user picks a subtype (Booking / Delivery /
 * Follow-up) at the top and the form swaps the field set. We avoid
 * three separate top-level tabs because the activity modal already has
 * 6 channel tabs and a 9-wide grid is too cramped on the smaller
 * lead-card layouts.
 *
 * The parent modal reads `__demoType` from getValues() to set the
 * outgoing CreateActivityDto.type.
 */

const DEMO_SUBTYPES = [
  { value: "demo_booking", label: "Booking", icon: Calendar },
  { value: "demo_delivery", label: "Delivery", icon: ListCheck },
  { value: "demo_followup", label: "Follow-up", icon: MessageCircle },
] as const;

type DemoSubType = (typeof DEMO_SUBTYPES)[number]["value"];

const ATTENDEE_ROLES = [
  "Head",
  "Deputy Head",
  "Bursar",
  "SDC",
  "ICT Teacher",
  "Teachers",
  "Other",
];

const PRODUCTS = [
  "Interactive Board",
  "LMS",
  "Student Tablets",
  "Teacher Laptops",
  "Digital Microscopes",
  "PASCO / Science Equipment",
  "Robotics / STEM",
  "Other",
];

interface FormValues {
  // Booking
  planned_at?: string;
  mode?: "on_site" | "virtual";
  expected_attendees: string[];
  agenda?: string;
  // Delivery
  actual_at?: string;
  attendees_present: string[];
  products_demonstrated: string[];
  key_questions?: string;
  pain_points?: string;
  decision_makers_present?: boolean;
  quantity_discussed?: string;
  payment_plan_discussed?: boolean;
  sdc_discussion?: boolean;
  notes?: string;
  // Follow-up
  followup_channel?: "call" | "whatsapp" | "email" | "meeting";
  next_activity_date?: string;
}

export const DemoTabForm = forwardRef<TabFormHandle, ActivityTabFormProps>(
  function DemoTabForm(_props, ref) {
    const [subType, setSubType] = useState<DemoSubType>("demo_booking");
    const form = useForm<FormValues>({
      defaultValues: {
        expected_attendees: [],
        attendees_present: [],
        products_demonstrated: [],
      },
      mode: "onTouched",
    });

    const toggleArrayItem = (
      field: "expected_attendees" | "attendees_present" | "products_demonstrated",
      item: string,
    ) => {
      const current = (form.getValues()[field] as string[]) ?? [];
      const next = current.includes(item)
        ? current.filter((x) => x !== item)
        : [...current, item];
      form.setValue(field, next as any, { shouldDirty: true });
    };

    useImperativeHandle(ref, () => ({
      trigger: async () => {
        const v = form.getValues();
        // Per-subtype required-field validation. The server enforces
        // this too, but a UI-side message catches the user before the
        // round trip.
        if (subType === "demo_booking" && !v.planned_at) {
          form.setError("planned_at", {
            message: "Demo date and time is required",
          });
          return false;
        }
        return true;
      },
      getValues: (): TabFormPayload => {
        const v = form.getValues();
        // The activity subject auto-fills from the subtype + lead so
        // the audit log + activity feeds read naturally.
        const subjectMap: Record<DemoSubType, string> = {
          demo_booking: "Demo booking",
          demo_delivery: "Demo delivery",
          demo_followup: "Demo follow-up",
        };
        return {
          subject: subjectMap[subType],
          __demoType: subType,
          due_at: v.planned_at, // Booking: due = planned date
          demo: {
            planned_at: v.planned_at,
            mode: v.mode,
            expected_attendees: v.expected_attendees,
            agenda: v.agenda,
            actual_at: v.actual_at,
            attendees_present: v.attendees_present,
            products_demonstrated: v.products_demonstrated,
            key_questions: v.key_questions,
            pain_points: v.pain_points,
            decision_makers_present: v.decision_makers_present,
            quantity_discussed: v.quantity_discussed,
            payment_plan_discussed: v.payment_plan_discussed,
            sdc_discussion: v.sdc_discussion,
            notes: v.notes,
            followup_channel: v.followup_channel,
            next_activity_date: v.next_activity_date,
          },
        };
      },
      reset: () =>
        form.reset({
          expected_attendees: [],
          attendees_present: [],
          products_demonstrated: [],
        }),
    }));

    return (
      <Form {...form}>
        <div className="space-y-4">
          {/* Subtype picker — pill-style, fits naturally inside the
              demo tab without competing with the channel tabs above. */}
          <Tabs
            value={subType}
            onValueChange={(v) => setSubType(v as DemoSubType)}
          >
            <TabsList className="grid w-full grid-cols-3">
              {DEMO_SUBTYPES.map((s) => (
                <TabsTrigger
                  key={s.value}
                  value={s.value}
                  data-testid={`demo-subtype-${s.value}`}
                >
                  <s.icon className="mr-1.5 h-3.5 w-3.5" />
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* ===== BOOKING ===== */}
          {subType === "demo_booking" && (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="planned_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Demo date &amp; time{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value ? new Date(field.value) : undefined}
                        onChange={(d) =>
                          field.onChange(d ? d.toISOString() : undefined)
                        }
                      />
                    </FormControl>
                    {form.formState.errors.planned_at && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.planned_at.message as string}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="On-site or Virtual" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="on_site">On-site</SelectItem>
                          <SelectItem value="virtual">Virtual</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div>
                <Label>Expected attendees</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {ATTENDEE_ROLES.map((r) => {
                    const checked = (
                      form.watch("expected_attendees") ?? []
                    ).includes(r);
                    return (
                      <label
                        key={r}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleArrayItem("expected_attendees", r)
                          }
                        />
                        {r}
                      </label>
                    );
                  })}
                </div>
              </div>

              <FormField
                control={form.control}
                name="agenda"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agenda / notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What will be covered in the demo?"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 flex gap-2 items-start">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Outcome will default to <strong>Scheduled</strong>. Once
                you mark the booking complete, you'll be prompted to log
                the Demo Delivery.
              </p>
            </div>
          )}

          {/* ===== DELIVERY ===== */}
          {subType === "demo_delivery" && (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="actual_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Actual demo date</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value ? new Date(field.value) : undefined}
                        onChange={(d) =>
                          field.onChange(d ? d.toISOString() : undefined)
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div>
                <Label>Attendees present</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {ATTENDEE_ROLES.map((r) => {
                    const checked = (
                      form.watch("attendees_present") ?? []
                    ).includes(r);
                    return (
                      <label
                        key={r}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleArrayItem("attendees_present", r)
                          }
                        />
                        {r}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label>Products demonstrated</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {PRODUCTS.map((p) => {
                    const checked = (
                      form.watch("products_demonstrated") ?? []
                    ).includes(p);
                    return (
                      <label
                        key={p}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleArrayItem("products_demonstrated", p)
                          }
                        />
                        {p}
                      </label>
                    );
                  })}
                </div>
              </div>

              <FormField
                control={form.control}
                name="key_questions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Key questions asked</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pain_points"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pain points identified</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity_discussed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity discussed</FormLabel>
                      <FormControl>
                        <Input
                          placeholder='e.g. "30 tablets" or "school-wide"'
                          {...field}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Filling this in counts as a commercial-intent
                        signal.
                      </p>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
                <FormField
                  control={form.control}
                  name="decision_makers_present"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <FormLabel className="cursor-pointer">
                        Decision makers present
                      </FormLabel>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="payment_plan_discussed"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <FormLabel className="cursor-pointer">
                        Payment plan discussed
                      </FormLabel>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="sdc_discussion"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border p-3">
                      <FormLabel className="cursor-pointer">
                        SDC discussion
                      </FormLabel>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                After saving, set the activity outcome (Completed /
                Strong Interest / Quote Requested / Decision Maker
                Absent / etc.) from the activity card. The system uses
                the outcome + the fields above to drive Commercial
                Intent and the 48-hour Demo Follow-up SLA.
              </p>
            </div>
          )}

          {/* ===== FOLLOW-UP ===== */}
          {subType === "demo_followup" && (
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="followup_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Follow-up channel</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="How are you following up?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="next_activity_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Next activity date</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value ? new Date(field.value) : undefined}
                        onChange={(d) =>
                          field.onChange(d ? d.toISOString() : undefined)
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Required unless your follow-up outcome is "Not
                      Interested".
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                Outcomes Quote Requested / SDC Meeting Requested / Payment
                Plan Discussion Requested trigger Commercial Intent on
                the lead.
              </p>
            </div>
          )}
        </div>
      </Form>
    );
  },
);
