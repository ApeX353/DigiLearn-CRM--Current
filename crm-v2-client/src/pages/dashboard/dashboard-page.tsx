import { useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Target,
  PlusCircle,
  GraduationCap,
  Receipt,
  FileText,
} from "lucide-react";
import { Link } from "react-router";
import {
  type DashboardFilters as DashboardFiltersType,
  useExecutiveKPIs,
  useSLACompliance,
} from "~/api/dashboard";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  DashboardFilters,
  ExecutiveKPIs,
  LeadsByStageWidget,
  SLAComplianceWidget,
  LeadConversionWidget,
  NurtureFollowUpsWidget,
  CollectionsDueWidget,
  SalesMetricsWidget,
  DemoStatsWidget,
  HighValueDealsWidget,
  FunnelHealthWidget,
  TopPerformingProductsWidget,
  SchoolsBoughtWidget,
  QualificationOverviewWidget,
  ActivityDisciplineSection,
} from "~/components/dashboard";
import { usePermission, useAnyRole } from "~/hooks/use-permission";
import { AddSchoolModal } from "~/components/schools/add-school-modal";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";
import AddDealModalContainer from "~/components/deals/add-deal-modal-container";

function SalesRepDashboard() {
  const [isAddSchoolOpen, setIsAddSchoolOpen] = useState(false);

  return (
    <div className="space-y-6 px-4 md:px-6 py-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quick actions for daily execution
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Button asChild className="justify-start h-11 shadow-sm">
          <Link to="/leads/new">
            <Target className="mr-2 h-4 w-4" />
            Create Lead
          </Link>
        </Button>

        <Button
          className="justify-start h-11 shadow-sm"
          onClick={() => useAddDealModalStore.getState().onOpen()}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Create New Deal
        </Button>

        <Button
          variant="outline"
          className="justify-start h-11"
          onClick={() => setIsAddSchoolOpen(true)}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Add School
        </Button>

        <Button variant="outline" asChild className="justify-start h-11">
          <Link to="/invoices/new">
            <Receipt className="mr-2 h-4 w-4" />
            Create Invoice
          </Link>
        </Button>

        <Button variant="outline" asChild className="justify-start h-11">
          <Link to="/quotes/new">
            <FileText className="mr-2 h-4 w-4" />
            Create Quote
          </Link>
        </Button>
      </div>

      <AddSchoolModal
        isOpen={isAddSchoolOpen}
        onClose={() => setIsAddSchoolOpen(false)}
      />
      <AddDealModalContainer />
    </div>
  );
}

export default function MainDashboardPage() {
  const hasExecutiveRole = useAnyRole(["admin", "manager", "sales_manager"]);
  const hasExecutiveDashboardPermission = usePermission("Dashboard", "read");
  const canViewExecutiveDashboard =
    hasExecutiveRole || hasExecutiveDashboardPermission;

  const [filters, setFilters] = useState<DashboardFiltersType>({
    dateRange: "mtd",
    salesRepId: undefined,
    province: undefined,
    productCategory: undefined,
  });

  // Fetch dashboard data with filters
  const {
    data: kpisData,
    isLoading: kpisLoading,
    error: kpisError,
  } = useExecutiveKPIs(filters, {
    enabled: canViewExecutiveDashboard,
  });
  const { data: slaComplianceData } = useSLACompliance(filters, {
    enabled: canViewExecutiveDashboard,
  });
  const kpis = kpisData?.data;

  if (!canViewExecutiveDashboard) {
    return <SalesRepDashboard />;
  }

  // Show initial loading state
  if (kpisLoading && !kpis) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const breachedLeadsCount = slaComplianceData?.data?.breached ?? 0;

  return (
    <div className="space-y-6 px-4 md:px-6 py-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Executive Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time overview of sales performance, pipeline health, and key
          metrics.
        </p>
      </div>

      {kpisError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Dashboard metrics unavailable</AlertTitle>
          <AlertDescription>
            Some executive metrics could not be loaded. Refresh the dashboard
            after confirming the API is running.
          </AlertDescription>
        </Alert>
      )}

      {/* SLA Breach Warning */}
      {breachedLeadsCount > 0 && (
        <Alert
          variant="destructive"
          className="border-destructive/50 bg-destructive/10"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Lead SLA Breach Alert</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {breachedLeadsCount} lead
              {breachedLeadsCount > 1 ? "s have" : " has"} breached SLA and
              require{breachedLeadsCount > 1 ? "s" : ""} immediate attention.
              A recent activity does not clear a breach unless the required SLA
              obligation has been satisfied.
            </span>
            <Button variant="destructive" size="sm" asChild>
              <Link to="/leads">View Leads</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Global Filters */}
      <DashboardFilters filters={filters} onFiltersChange={setFilters} />

      {/* Top KPIs */}
      <ExecutiveKPIs data={kpis} isLoading={kpisLoading} />

      {/* Section: Lead Pipeline */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Lead Pipeline
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <LeadsByStageWidget filters={filters} />
          <SLAComplianceWidget filters={filters} />
          <LeadConversionWidget filters={filters} />
          <NurtureFollowUpsWidget filters={filters} />
        </div>
      </div>

      {/* Activity Discipline — manager-grade section: quality
          (outcome / next-step compliance), volume next to progression,
          per-rep leaderboard, and at-risk insights. The older
          "contacts vs target" card stays as a secondary lens
          because some managers still use daily target as a coaching
          tool — but the new section is the primary signal. */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">Activity Discipline</h2>
        {/* LeadsContactedWidget retired — its "leads contacted vs
            daily target" card now lives inside the Prospecting
            Discipline block at the top of this section, with the
            stricter first-TIME-contact definition (not any touch). */}
        <ActivityDisciplineSection filters={filters} />
      </div>

      {/* Cash & Collections */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Cash & Collections
        </h2>
        <CollectionsDueWidget filters={filters} />
      </div>

      {/* Sales Performance */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Sales Performance
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SalesMetricsWidget filters={filters} />
          <DemoStatsWidget filters={filters} />
        </div>
      </div>

      {/* Pipeline Health */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Pipeline Health
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FunnelHealthWidget filters={filters} />
          <HighValueDealsWidget filters={filters} />
        </div>
      </div>

      {/* Qualification Insights */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Qualification Insights
        </h2>
        <QualificationOverviewWidget filters={filters} />
      </div>

      {/* Core Business Volume */}
      <div className="space-y-3">
        <h2 className="label-overline text-[13px]">
          Core Business Volume
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <TopPerformingProductsWidget filters={filters} />
          <SchoolsBoughtWidget filters={filters} />
        </div>
      </div>
    </div>
  );
}
