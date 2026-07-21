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
  LeadsContactedWidget,
  CollectionsDueWidget,
  SalesMetricsWidget,
  DemoStatsWidget,
  HighValueDealsWidget,
  FunnelHealthWidget,
  TopPerformingProductsWidget,
  SchoolsBoughtWidget,
  QualificationOverviewWidget,
} from "~/components/dashboard";
import { usePermission, useAnyRole } from "~/hooks/use-permission";
import { AddSchoolModal } from "~/components/schools/add-school-modal";
import { useAddDealModalStore } from "~/stores/use-add-deal-modal-store";
import AddDealModalContainer from "~/components/deals/add-deal-modal-container";

function SalesRepDashboard() {
  const [isAddSchoolOpen, setIsAddSchoolOpen] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales Rep Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Quick actions for daily execution.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Button asChild className="justify-start">
          <Link to="/leads/new">
            <Target className="mr-2 h-4 w-4" />
            Create Lead
          </Link>
        </Button>

        <Button
          className="justify-start"
          onClick={() => useAddDealModalStore.getState().onOpen()}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Create New Deal
        </Button>

        <Button
          variant="outline"
          className="justify-start"
          onClick={() => setIsAddSchoolOpen(true)}
        >
          <GraduationCap className="mr-2 h-4 w-4" />
          Add School
        </Button>

        <Button variant="outline" asChild className="justify-start">
          <Link to="/invoices/new">
            <Receipt className="mr-2 h-4 w-4" />
            Create Invoice
          </Link>
        </Button>

        <Button variant="outline" asChild className="justify-start">
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
  const { data: kpisData, isLoading: kpisLoading } = useExecutiveKPIs(filters, {
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

  // Calculate breached leads count (example - you may need to adjust based on your data)
  const breachedLeadsCount = 0; // TODO: Get from SLA compliance data

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Executive Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Real-time overview of sales performance, pipeline health, and key
          metrics.
        </p>
      </div>

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
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Lead Pipeline
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <LeadsByStageWidget filters={filters} />
          <SLAComplianceWidget filters={filters} />
          <LeadConversionWidget filters={filters} />
          <NurtureFollowUpsWidget filters={filters} />
        </div>
      </div>

      {/* Activity Discipline */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Activity Discipline
        </h2>
        <LeadsContactedWidget filters={filters} />
      </div>

      {/* Cash & Collections */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Cash & Collections
        </h2>
        <CollectionsDueWidget filters={filters} />
      </div>

      {/* Sales Performance */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Sales Performance
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <SalesMetricsWidget filters={filters} />
          <DemoStatsWidget filters={filters} />
        </div>
      </div>

      {/* Pipeline Health */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Pipeline Health
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FunnelHealthWidget filters={filters} />
          <HighValueDealsWidget filters={filters} />
        </div>
      </div>

      {/* Qualification Insights */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
          Qualification Insights
        </h2>
        <QualificationOverviewWidget filters={filters} />
      </div>

      {/* Core Business Volume */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-wide">
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
