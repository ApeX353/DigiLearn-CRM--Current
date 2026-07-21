import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import type { School } from "~/api/schools";
import { Building2, MapPin, Globe, User, Calendar, Tag } from "lucide-react";
import { RelatedLeadsSection } from "~/components/leads/related-leads";

interface OverviewTabProps {
  school: School;
}

export function OverviewTab({ school }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      <RelatedLeadsSection
        schoolId={school.id}
        schoolName={school.name}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {/* School Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              School Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    School Name
                  </p>
                  <p className="text-base font-semibold">{school.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    School Type
                  </p>
                  <Badge className="mt-1">{school.school_type}</Badge>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Ownership Type
                  </p>
                  <p className="text-base">{school.ownership_type}</p>
                </div>
              </div>

              {school.church_denomination && (
                <div className="flex items-start gap-3">
                  <Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Church Denomination
                    </p>
                    <p className="text-base">{school.church_denomination}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <User className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Principal Name
                  </p>
                  <p className="text-base font-semibold">
                    {school.principal_name}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Created At
                  </p>
                  <p className="text-base">
                    {format(new Date(school.created_at), "MMM dd, yyyy")}
                  </p>
                </div>
              </div>

              {school.website && (
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Website
                    </p>
                    <a
                      href={school.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base text-primary hover:underline"
                    >
                      {school.website}
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Tag className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  {school.is_active ? (
                    <Badge variant="default" className="mt-1">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="mt-1">
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Address
                </p>
                <p className="text-base">{school.address}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  City
                </p>
                <p className="text-base">{school.city}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Province
                </p>
                <p className="text-base">{school.province}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Region
                </p>
                <p className="text-base capitalize">{school.region}</p>
              </div>

              {school.country && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Country
                  </p>
                  <p className="text-base">{school.country}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
