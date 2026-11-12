import { useState, type ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Clock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
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
import Modal from "~/components/ui/modal";
import {
  useLeadSLAs,
  useCreateLeadSLA,
  useUpdateLeadSLA,
  useRemoveLeadSLA,
  type LeadSLA,
  type AddLeadSlaValues,
  addLeadSLASchema,
} from "~/api/lead-sla";
import type { LeadStatus } from "~/api/leads";

const LEAD_STATUSES: LeadStatus[] = [
  "New",
  "Contacted",
  "Qualified",
  "Disqualified",
  "Converted",
];

const statusColors: Record<string, string> = {
  New: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Contacted:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Qualified:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Disqualified: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Converted:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

const LeadSLAConfigContent = () => {
  const { data: slaData, isLoading } = useLeadSLAs({
    include_inactive: true,
  });
  const slaConfigs = slaData?.data || [];
  const createSLA = useCreateLeadSLA();
  const updateSLA = useUpdateLeadSLA();
  const removeSLA = useRemoveLeadSLA();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSLA, setEditingSLA] = useState<LeadSLA | null>(null);
  const [deletingSLA, setDeletingSLA] = useState<LeadSLA | null>(null);

  const form = useForm<AddLeadSlaValues>({
    resolver: zodResolver(addLeadSLASchema),
    defaultValues: {
      status: "New",
      sla_hours: 24,
      escalation_after_hours: 48,
      idle_alert_hours: 12,
      description: "",
      message: "",
    },
  });

  const openAdd = () => {
    setEditingSLA(null);
    form.reset({
      status: "New",
      sla_hours: 24,
      escalation_after_hours: 48,
      idle_alert_hours: 12,
      description: "",
      message: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (sla: LeadSLA) => {
    setEditingSLA(sla);
    form.reset({
      status: sla.status,
      sla_hours: sla.sla_hours,
      escalation_after_hours: sla.escalation_after_hours,
      idle_alert_hours: sla.idle_alert_hours,
      description: sla.description || "",
      message: sla.message || "",
    });
    setDialogOpen(true);
  };

  const onSubmit = async (values: AddLeadSlaValues) => {
    try {
      if (editingSLA) {
        await updateSLA.mutateAsync({ id: editingSLA.id, data: values });
        toast.success("SLA config updated");
      } else {
        await createSLA.mutateAsync(values);
        toast.success("SLA config created");
      }
      setDialogOpen(false);
    } catch {
      toast.error(
        editingSLA
          ? "Failed to update SLA config"
          : "Failed to create SLA config",
      );
    }
  };

  const handleDelete = async () => {
    if (!deletingSLA) return;
    try {
      await removeSLA.mutateAsync(deletingSLA.id);
      toast.success("SLA config deleted");
      setDeletingSLA(null);
    } catch {
      toast.error("Failed to delete SLA config");
    }
  };

  const isSubmitting = createSLA.isPending || updateSLA.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Lead SLA Configurations ({slaConfigs?.length ?? 0})
          </CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Config
          </Button>
        </CardHeader>
        <CardContent>
          {!slaConfigs || slaConfigs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No SLA configurations found. Create your first config to get
              started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA Hours</TableHead>
                  <TableHead>Escalation After</TableHead>
                  <TableHead>Idle Alert</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {slaConfigs.map((sla) => (
                  <TableRow
                    key={sla.id}
                    className={!sla.is_active ? "opacity-60" : ""}
                  >
                    <TableCell>
                      <Badge className={statusColors[sla.status] || ""}>
                        {sla.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{sla.sla_hours}h</span>
                    </TableCell>
                    <TableCell>{sla.escalation_after_hours}h</TableCell>
                    <TableCell>{sla.idle_alert_hours}h</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {sla.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sla.is_active ? "default" : "secondary"}>
                        {sla.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(sla)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingSLA(sla)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingSLA ? "Edit SLA Config" : "Add SLA Config"}
        description={
          editingSLA
            ? "Update the SLA configuration for this lead status"
            : "Configure SLA rules for a lead status"
        }
        size="sm"
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!editingSLA}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="sla_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Hours</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} value={field.value} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="escalation_after_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Escalation After (h)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} value={field.value} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="idle_alert_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Idle Alert (h)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} value={field.value} onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(Number(e.target.value))} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of this SLA rule"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Alert Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Message shown when SLA is breached"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingSLA
                    ? "Save Changes"
                    : "Create Config"}
              </Button>
            </div>
          </form>
        </Form>
      </Modal>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingSLA}
        onOpenChange={(open) => !open && setDeletingSLA(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SLA Config</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the SLA configuration for{" "}
              <strong>{deletingSLA?.status}</strong> leads? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeSLA.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default LeadSLAConfigContent;
