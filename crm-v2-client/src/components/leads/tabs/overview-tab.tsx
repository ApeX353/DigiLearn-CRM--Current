import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import type { Lead } from "~/api/leads";
import { User, Phone, Mail } from "lucide-react";
import { LeadJourneyTracker } from "../lead-journey-tracker";

interface OverviewTabProps {
  lead: Lead;
  onEditQualification?: () => void;
}

export function OverviewTab({ lead, onEditQualification }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Lead Journey Tracker */}
      <LeadJourneyTracker lead={lead} onEdit={onEditQualification} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lead.primary_contact ? (
              <>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {lead.primary_contact.first_name}{" "}
                    {lead.primary_contact.last_name}
                  </span>
                </div>
                {lead.primary_contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${lead.primary_contact.phone}`}
                      className="text-primary hover:underline"
                    >
                      {lead.primary_contact.phone}
                    </a>
                  </div>
                )}
                {lead.primary_contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${lead.primary_contact.email}`}
                      className="text-primary hover:underline"
                    >
                      {lead.primary_contact.email}
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No contact information
              </p>
            )}
          </CardContent>
        </Card>

        {/* Interest Areas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Interest Areas</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.school?.school_type ? (
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{lead.school.school_type}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No interest areas set
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.notes ? (
            <p className="text-base whitespace-pre-wrap">{lead.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No notes available</p>
          )}
        </CardContent>
      </Card>

      {/* Lead Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lead Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Created
              </p>
              <p className="text-base">
                {format(lead.created_at, "MMM dd, yyyy h:mm a")}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Last Updated
              </p>
              <p className="text-base">
                {format(lead.updated_at, "MMM dd, yyyy h:mm a")}
              </p>
            </div>
            {lead.last_action_at && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Stage Entered
                </p>
                <p className="text-base">
                  {format(lead.last_action_at, "MMM dd, yyyy h:mm a")}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
