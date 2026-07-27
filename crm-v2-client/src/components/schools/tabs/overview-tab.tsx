import { format } from "date-fns";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import type { School } from "~/api/schools";
import { Building2, MapPin } from "lucide-react";
import { RelatedLeadsSection } from "~/components/leads/related-leads";
import { SchoolCityCell } from "~/components/schools/school-city-cell";

interface OverviewTabProps {
  school: School;
}

/**
 * School overview — compact definition-list layout.
 *
 * Was a two-column grid of icon+label+value stacks inside full
 * `Card` tiles with `p-6` padding. That pattern overflowed the
 * ~398px side rail on the school detail page: icons ate horizontal
 * space, values wrapped awkwardly, and the two-column grid either
 * collapsed to 1-col (wasted vertical room) or crammed two mid-length
 * values side-by-side.
 *
 * New shape: single-column stacked rows with a small muted label on
 * the left and a right-aligned value. No icons inside the rows — the
 * section header carries the icon. Card padding uses the new compact
 * defaults (`px-4 py-4`) so the whole summary reads as a tight CRM
 * side-column.
 */
export function OverviewTab({ school }: OverviewTabProps) {
  return (
    <div className="space-y-3">
      <RelatedLeadsSection schoolId={school.id} schoolName={school.name} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            School
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="divide-y divide-border/60">
            <Row label="Name" value={school.name} />
            <Row
              label="Type"
              value={<Badge variant="secondary">{school.school_type}</Badge>}
            />
            <Row label="Ownership" value={school.ownership_type} />
            {school.church_denomination && (
              <Row label="Denomination" value={school.church_denomination} />
            )}
            <Row label="Principal" value={school.principal_name} />
            {school.website && (
              <Row
                label="Website"
                value={
                  <a
                    href={school.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate block"
                  >
                    {school.website}
                  </a>
                }
              />
            )}
            <Row
              label="Created"
              value={format(new Date(school.created_at), "MMM d, yyyy")}
            />
            <Row
              label="Status"
              value={
                school.is_active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )
              }
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            Location
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <dl className="divide-y divide-border/60">
            <Row label="Address" value={school.address} />
            <Row
              label="City"
              value={
                <SchoolCityCell
                  schoolId={school.id}
                  schoolName={school.name}
                  city={school.city}
                  className="text-xs font-medium text-right"
                />
              }
            />
            <Row label="Province" value={school.province} />
            <Row
              label="Region"
              value={<span className="capitalize">{school.region}</span>}
            />
            {school.country && <Row label="Country" value={school.country} />}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compact label/value row for the side-rail summary. Label fixed-width
 * on the left, value right-aligned and allowed to wrap if needed.
 */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-right min-w-0 break-words">
        {value}
      </dd>
    </div>
  );
}
