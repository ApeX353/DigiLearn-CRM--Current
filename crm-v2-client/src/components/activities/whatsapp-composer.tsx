import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import { MessageSquare, Send, Loader2 } from "lucide-react";

const WHATSAPP_TEMPLATES = [
  {
    name: "demo_followup",
    displayName: "Demo Follow-up",
    description:
      "Thank you for attending the DigiLearn demo. We hope you found it valuable.",
    variables: ["schoolName", "contactName"],
  },
  {
    name: "quote_sent",
    displayName: "Quote Sent Notification",
    description:
      "We have sent you a quote for the DigiLearn ecosystem. Please review it.",
    variables: ["contactName", "quoteNumber"],
  },
  {
    name: "payment_reminder",
    displayName: "Payment Reminder",
    description:
      "This is a friendly reminder that your payment is due.",
    variables: ["schoolName", "amount", "dueDate"],
  },
  {
    name: "welcome_school",
    displayName: "Welcome New School",
    description:
      "Welcome to DigiLearn! We are excited to have your school join our ecosystem.",
    variables: ["schoolName", "contactName"],
  },
  {
    name: "meeting_confirmation",
    displayName: "Meeting Confirmation",
    description:
      "Your meeting with DigiLearn has been confirmed.",
    variables: ["contactName", "meetingDate", "meetingTime"],
  },
] as const;

interface WhatsAppComposerProps {
  leadId: string;
  contactPhone?: string;
  contactName?: string;
  schoolName?: string;
}

export function WhatsAppComposer({
  leadId,
  contactPhone = "",
  contactName = "",
  schoolName = "",
}: WhatsAppComposerProps) {
  const [phone, setPhone] = useState(contactPhone);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();

  const selectedTemplateConfig = WHATSAPP_TEMPLATES.find(
    (t) => t.name === selectedTemplate
  );

  const sendMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClientAuth.post("/activities/whatsapp/send", {
        leadId,
        contactPhone: phone,
        templateName: selectedTemplate,
        templateVariables: variables,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.sent) {
        toast.success("WhatsApp message sent successfully");
      } else {
        toast.warning(
          "Message recorded but could not be sent (WhatsApp not configured)"
        );
      }
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setSelectedTemplate("");
      setVariables({});
    },
    onError: () => {
      toast.error("Failed to send WhatsApp message");
    },
  });

  const handleTemplateChange = (value: string) => {
    setSelectedTemplate(value);
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === value);
    if (template) {
      const vars: Record<string, string> = {};
      for (const v of template.variables) {
        if (v === "contactName") vars[v] = contactName;
        else if (v === "schoolName") vars[v] = schoolName;
        else vars[v] = "";
      }
      setVariables(vars);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-600" />
          Send WhatsApp Message
        </CardTitle>
        <CardDescription className="text-xs">
          Send a template message via WhatsApp Business API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-xs">Phone Number</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+263771234567"
            className="mt-1"
          />
        </div>

        <div>
          <Label className="text-xs">Template</Label>
          <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {WHATSAPP_TEMPLATES.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTemplateConfig && (
          <>
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              {selectedTemplateConfig.description}
            </div>

            {selectedTemplateConfig.variables.map((v) => (
              <div key={v}>
                <Label className="text-xs capitalize">
                  {v.replace(/([A-Z])/g, " $1").trim()}
                </Label>
                <Input
                  value={variables[v] || ""}
                  onChange={(e) =>
                    setVariables((prev) => ({ ...prev, [v]: e.target.value }))
                  }
                  className="mt-1"
                  placeholder={v}
                />
              </div>
            ))}
          </>
        )}

        <Button
          className="w-full"
          size="sm"
          disabled={!phone || !selectedTemplate || sendMutation.isPending}
          onClick={() => sendMutation.mutate()}
        >
          {sendMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          Send WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
