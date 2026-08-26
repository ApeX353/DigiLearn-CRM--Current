import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Plus, Trash2, Loader2, Mail, Clock } from "lucide-react";
import { format } from "date-fns";

interface EmailSequenceStep {
  delay_hours: number;
  template_name: string;
  subject: string;
}

interface EmailSequence {
  id: string;
  name: string;
  trigger_event: string;
  steps: EmailSequenceStep[];
  is_active: boolean;
  created_at: string;
}

interface QueueItem {
  id: string;
  lead_id: string;
  sequence_id: string;
  step_index: number;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  error_message: string | null;
  lead?: { lead_name: string };
  sequence?: { name: string };
}

const TRIGGER_EVENTS = [
  { value: "lead_status_change_to_New", label: "Lead becomes New" },
  { value: "lead_status_change_to_Contacted", label: "Lead becomes Contacted" },
  { value: "lead_status_change_to_Nurture", label: "Lead enters Nurture" },
  { value: "lead_status_change_to_Qualified", label: "Lead becomes Qualified" },
  {
    value: "lead_status_change_to_Converted",
    label: "Lead is Converted",
  },
];

export default function EmailSequencesPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("");
  const [newSteps, setNewSteps] = useState<EmailSequenceStep[]>([
    { delay_hours: 0, template_name: "post-demo-followup", subject: "Thank you for your time!" },
  ]);

  const { data: sequences, isLoading } = useQuery({
    queryKey: ["email-sequences"],
    queryFn: () =>
      apiClientAuth.get("/email-sequences").then((r) => r.data.data as EmailSequence[]),
  });

  const { data: queueItems } = useQuery({
    queryKey: ["email-sequences", "queue"],
    queryFn: () =>
      apiClientAuth.get("/email-sequences/queue").then((r) => r.data.data as QueueItem[]),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; trigger_event: string; steps: EmailSequenceStep[] }) =>
      apiClientAuth.post("/email-sequences", data),
    onSuccess: () => {
      toast.success("Sequence created");
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
      setCreateOpen(false);
      setNewName("");
      setNewTrigger("");
      setNewSteps([{ delay_hours: 0, template_name: "", subject: "" }]);
    },
    onError: () => toast.error("Failed to create sequence"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClientAuth.delete(`/email-sequences/${id}`),
    onSuccess: () => {
      toast.success("Sequence deleted");
      queryClient.invalidateQueries({ queryKey: ["email-sequences"] });
    },
  });

  const addStep = () => {
    setNewSteps([...newSteps, { delay_hours: 24, template_name: "", subject: "" }]);
  };

  const removeStep = (index: number) => {
    setNewSteps(newSteps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, field: keyof EmailSequenceStep, value: string | number) => {
    const updated = [...newSteps];
    (updated[index] as any)[field] = value;
    setNewSteps(updated);
  };

  return (
    <Container>
      <PageHeader
        title="Email Sequences"
        subtitle="Automated email workflows triggered by lead events"
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Sequence
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Email Sequence</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Sequence Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Post-Demo Follow-up"
                  />
                </div>
                <div>
                  <Label>Trigger Event</Label>
                  <Select value={newTrigger} onValueChange={setNewTrigger}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_EVENTS.map((e) => (
                        <SelectItem key={e.value} value={e.value}>
                          {e.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Steps</Label>
                  <div className="space-y-3 mt-2">
                    {newSteps.map((step, i) => (
                      <div key={i} className="flex gap-2 items-end border p-3 rounded-md">
                        <div className="flex-1">
                          <Label className="text-xs">Delay (hours)</Label>
                          <Input
                            type="number"
                            value={step.delay_hours}
                            onChange={(e) => updateStep(i, "delay_hours", Number(e.target.value))}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Template</Label>
                          <Input
                            value={step.template_name}
                            onChange={(e) => updateStep(i, "template_name", e.target.value)}
                            placeholder="template-name"
                          />
                        </div>
                        <div className="flex-[2]">
                          <Label className="text-xs">Subject</Label>
                          <Input
                            value={step.subject}
                            onChange={(e) => updateStep(i, "subject", e.target.value)}
                            placeholder="Email subject line"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStep(i)}
                          disabled={newSteps.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addStep}>
                      <Plus className="h-3 w-3 mr-1" /> Add Step
                    </Button>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    createMutation.mutate({
                      name: newName,
                      trigger_event: newTrigger,
                      steps: newSteps,
                    })
                  }
                  disabled={!newName || !newTrigger || createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Create Sequence
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <section className="p-4">
        <Tabs defaultValue="sequences">
          <TabsList>
            <TabsTrigger value="sequences">Sequences</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="sequences" className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !sequences?.length ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No email sequences configured yet
                </CardContent>
              </Card>
            ) : (
              sequences.map((seq) => (
                <Card key={seq.id}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{seq.name}</CardTitle>
                      <CardDescription>
                        Trigger:{" "}
                        {TRIGGER_EVENTS.find((e) => e.value === seq.trigger_event)?.label ||
                          seq.trigger_event}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={seq.is_active ? "default" : "secondary"}>
                        {seq.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(seq.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      {seq.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {i > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {step.delay_hours}h
                            </div>
                          )}
                          <Badge variant="outline" className="text-xs">
                            Step {i + 1}: {step.subject}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="queue">
            <Card>
              <CardHeader>
                <CardTitle>Email Queue</CardTitle>
                <CardDescription>Pending and processed emails</CardDescription>
              </CardHeader>
              <CardContent>
                {!queueItems?.length ? (
                  <p className="text-center py-4 text-muted-foreground">
                    No queued emails
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Sequence</TableHead>
                        <TableHead>Step</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.lead?.lead_name || item.lead_id}</TableCell>
                          <TableCell>{item.sequence?.name || item.sequence_id}</TableCell>
                          <TableCell>Step {item.step_index + 1}</TableCell>
                          <TableCell>
                            {format(new Date(item.scheduled_at), "MMM dd, h:mm a")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === "sent"
                                  ? "default"
                                  : item.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </Container>
  );
}
