import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router";
import { Calendar, Check, ExternalLink, GitMerge, MapPin, Phone, Plus, Users } from "lucide-react";
import { useLeads, type Lead } from "~/api/leads";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { MergeLeadsDialog } from "./merge-leads-dialog";

interface RelatedLeadsSectionProps {
  schoolId: string;
  schoolName: string;
  currentLeadId?: string | null;
  /**
   * When provided, clicking a lead calls this instead of navigating to the
   * lead page — lets the host (e.g. the school page) show the lead's
   * activities in-place. Falls back to navigation when omitted.
   */
  onSelectLead?: (leadId: string, leadName: string) => void;
}

const statusColors: Record<string, string> = {
  New: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  Contacted: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
  Qualified: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  Nurture: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  Disqualified:
    "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
  Converted:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
};

export function RelatedLeadsSection({
  schoolId,
  schoolName,
  currentLeadId,
  onSelectLead,
}: RelatedLeadsSectionProps) {
  const navigate = useNavigate();
  const openLead = (lead: Lead) =>
    onSelectLead
      ? onSelectLead(lead.id, lead.lead_name)
      : navigate(`/leads/${lead.id}`);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedLeadForMerge, setSelectedLeadForMerge] = useState<string | null>(
    null,
  );

  const { data: leadsData, isLoading } = useLeads({
    page: 1,
    limit: 1000,
    school_id: schoolId,
    // A school's history includes the leads that died there — that is
    // context for the next attempt, not clutter. The active count on the
    // school page already filters terminal statuses client-side.
    include_archived: true,
  });

  const schoolLeads = leadsData?.data || [];
  const selectedLead = schoolLeads.find((lead) => lead.id === selectedLeadForMerge) || null;

  const targetLeads = useMemo(
    () => schoolLeads.filter((lead) => lead.id !== selectedLeadForMerge),
    [schoolLeads, selectedLeadForMerge],
  );

  const defaultTargetLeadId = useMemo(() => {
    if (!selectedLeadForMerge || targetLeads.length === 0) {
      return undefined;
    }

    if (
      currentLeadId &&
      currentLeadId !== selectedLeadForMerge &&
      targetLeads.some((lead) => lead.id === currentLeadId)
    ) {
      return currentLeadId;
    }

    return targetLeads[0].id;
  }, [currentLeadId, selectedLeadForMerge, targetLeads]);

  const handleOpenMerge = (leadId: string) => {
    setSelectedLeadForMerge(leadId);
    setMergeDialogOpen(true);
  };

  const hasMergeTargets = schoolLeads.length > 1;

  const renderLocation = (lead: Lead) => {
    const city = lead.school?.city?.trim();
    const district = lead.school?.district?.trim();
    const province = lead.school?.province?.trim();
    return [city, district, province].filter(Boolean).join(", ") || "--";
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Related Leads
              </CardTitle>
              <CardDescription>
                All leads linked to {schoolName} ({schoolLeads.length})
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={`/leads/new?school_id=${schoolId}`}>
                <Plus className="h-4 w-4" />
                New lead
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-lg bg-muted" />
              ))}
            </div>
          ) : schoolLeads.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <span>No leads are linked to this school yet.</span>
              <Button asChild size="sm">
                <Link to={`/leads/new?school_id=${schoolId}`}>
                  <Plus className="h-4 w-4" />
                  Create the first lead for {schoolName}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {schoolLeads.map((lead) => {
                const isCurrentLead = lead.id === currentLeadId;
                const canMergeThisLead = hasMergeTargets && !isCurrentLead;

                // Card body is a MOUSE convenience: clicking anywhere (except
                // the real controls below) peeks the lead's activities in
                // place. Intentionally NOT a role=button/tabIndex/keydown
                // target — that made the whole card an ARIA button wrapping
                // the name link + Merge button, and its keydown handler
                // hijacked Enter/Space on those nested controls (the name link
                // stopped navigating for keyboard users, Merge became
                // unreachable). Keyboard/AT users use the real controls: the
                // name link navigates, Merge merges.
                return (
                  <div
                    key={lead.id}
                    onClick={() => openLead(lead)}
                    className={`flex cursor-pointer items-start justify-between gap-4 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40 ${
                      isCurrentLead ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* The name is always a real link to the lead
                            detail page — clicking it navigates away.
                            stopPropagation keeps it from also firing the
                            card's in-place activity focus. Body clicks
                            (anywhere else on the card) still focus the
                            lead's activities in place. */}
                        <Link
                          to={`/leads/${lead.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          {lead.lead_name}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <Badge
                          className={
                            statusColors[lead.status] || "bg-muted text-foreground"
                          }
                        >
                          {lead.status}
                        </Badge>
                        {isCurrentLead && (
                          <Badge variant="outline" className="gap-1">
                            <Check className="h-3 w-3" />
                            Current deal lead
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {renderLocation(lead)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lead.primary_contact?.phone || "--"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(lead.created_at), "MMM d, yyyy")}
                        </span>
                      </div>
                    </div>

                    {canMergeThisLead && (
                      <div className="shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenMerge(lead.id);
                          }}
                        >
                          <GitMerge className="mr-1 h-3.5 w-3.5" />
                          Merge
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <MergeLeadsDialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          setMergeDialogOpen(open);
          if (!open) {
            setSelectedLeadForMerge(null);
          }
        }}
        sourceLead={selectedLead}
        targetLeads={targetLeads}
        defaultTargetLeadId={defaultTargetLeadId}
        onSuccess={() => {
          setSelectedLeadForMerge(null);
        }}
      />
    </>
  );
}
