import { useState } from "react";
import { useParams, Link } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { RecordDetailLayout } from "~/components/layout/record-detail-layout";
import { KpiPill } from "~/components/layout/kpi-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { useSchool, useSchoolStats } from "~/api/schools";
import {
  OverviewTab,
  ContactsTab,
  ActivitiesTab,
  SchoolDealsTab,
  SchoolInstallmentsTab,
} from "~/components/schools/tabs";
import {
  Loader2,
  AlertCircle,
  Activity,
  Paperclip,
  Plus,
  Pencil,
  Briefcase,
  Users,
  FileCheck,
  DollarSign,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { useQuotes } from "~/api/quotes";
import { useInvoices } from "~/api/invoices";
import { FilesTab } from "~/components/deals/tabs/files-tab";
import { RelatedLeadsSection } from "~/components/leads/related-leads";
import { EngagementWorkspace } from "~/components/activities/engagement-workspace";
import { formatCurrency } from "~/lib/utils";
import { EditSchoolModal } from "~/components/schools/edit-school-modal";
import { QuotePreviewModal } from "~/components/quotes/quote-preview-modal";
import { InvoicePreviewModal } from "~/components/invoices/invoice-preview-modal";

export default function ViewSchoolPage() {
  const { id } = useParams();

  if (!id) {
    return (
      <div>
        <PageHeader hasBackButton title="View School" />
        <Container className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              School ID is required to view this page.
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  return <ViewSchool id={id} />;
}

const ViewSchool = ({ id }: { id: string }) => {
  const [editOpen, setEditOpen] = useState(false);
  const [previewQuoteId, setPreviewQuoteId] = useState<string | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
  // Controlled tabs + the currently-focused lead/deal, so clicking a related
  // lead/deal card shows THAT record's activities in the school's activity log
  // (in-page) instead of navigating away to the lead or pipeline page.
  const [activeTab, setActiveTab] = useState("activities");
  const [focusEntity, setFocusEntity] = useState<{
    type: "lead" | "deal";
    id: string;
    name: string;
  } | null>(null);
  const { data: schoolData, isLoading, error } = useSchool(id);
  const { data: quotesData } = useQuotes({
    school_id: id,
    page: 1,
    limit: 100,
  });

  const { data: invoicesData } = useInvoices({
    school_id: id,
    page: 1,
    limit: 100,
  });

  const { data: statsData } = useSchoolStats(id);

  const school = schoolData?.data;
  const stats = statsData?.data;
  const quotes = quotesData?.data || [];
  const invoices = invoicesData?.data || [];

  if (isLoading) {
    return (
      <div>
        <PageHeader hasBackButton title="Loading..." />
        <Container className="p-4">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </Container>
      </div>
    );
  }

  if (error || !school) {
    return (
      <div>
        <PageHeader hasBackButton title="Error" />
        <Container className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading School</AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load school details."}
            </AlertDescription>
          </Alert>
        </Container>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
      <PageHeader
        hasBackButton
        eyebrow="School"
        title={school.name}
        // IDENTITY TRIM — same product rule as Deal + Lead detail.
        // District/province and the Active/Inactive badge used to
        // sit as a subtitle under the title; both live verbatim on
        // the left-pane OverviewTab (Location card + Status row) and
        // the active/inactive state also gates KPI pills above it.
        // Duplicating them here violated LEFT=context / RIGHT=work.
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit School
          </Button>
        }
      />
      <RecordDetailLayout
        fillViewport={false}
        className="flex-1 min-h-0"
        left={
          <>
            {/* Slim KPI pills — was a 2x2 grid of full `Card` tiles
                (default `p-6` + `text-xl font-bold` values). In the
                ~398px left rail the currency values overflowed on
                "Outstanding" and "Active deals value". The shared
                KpiPill gives each metric a one-row layout with an
                icon chip, label overline, truncatable tabular value,
                and optional muted sub-line — fits cleanly in any
                split-layout side pane. */}
            <div className="grid grid-cols-1 gap-2">
              <KpiPill
                label="Active deals"
                value={String(stats?.activeDeals.count ?? 0)}
                icon={<Briefcase className="h-3.5 w-3.5 text-muted-foreground" />}
                sub={`${formatCurrency(stats?.activeDeals.totalValue ?? 0)} value`}
              />
              <KpiPill
                label="Enrollment"
                value={
                  school?.student_count
                    ? school.student_count.toLocaleString()
                    : "—"
                }
                icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              <KpiPill
                label="Open quotes"
                value={String(stats?.openQuotes.count ?? 0)}
                icon={<FileCheck className="h-3.5 w-3.5 text-muted-foreground" />}
              />
              <KpiPill
                label="Outstanding"
                value={formatCurrency(
                  stats?.outstandingInvoices.totalValue ?? 0,
                )}
                icon={<DollarSign className="h-3.5 w-3.5 text-muted-foreground" />}
                sub={`${stats?.outstandingInvoices.count ?? 0} pending`}
              />
            </div>

            {/* School overview — structural info that used to live
                inside the Overview tab is now the primary left-pane
                content. The tab has been retired. The always-visible
                Related Leads card lives here; wiring onSelectLead makes
                its cards focus that lead's activities in the right-pane
                log instead of navigating away to the lead page. */}
            <OverviewTab
              school={school}
              onSelectLead={(leadId, leadName) => {
                setFocusEntity({ type: "lead", id: leadId, name: leadName });
                setActiveTab("activities");
              }}
            />
          </>
        }
        right={
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v);
              // Manual tab navigation always resets to the full school view;
              // only a lead/deal card click focuses a single record.
              setFocusEntity(null);
            }}
            className="w-full"
          >
            {/* Activities default; Overview retired (now in left pane).
                Sticky tab strip keeps the content-type switch visible
                while the workspace feed scrolls. */}
            <div className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 py-1.5 bg-background/95 backdrop-blur-sm border-b">
              <TabsList className="w-full justify-start overflow-x-auto bg-transparent">
                <TabsTrigger value="activities">
                  <Activity className="h-4 w-4 mr-1" />
                  Activities
                </TabsTrigger>
                {/* Fast-paths into the shared engagement workspace
                    pre-filtered by activity type — same Notes/Emails
                    /Calls triple we added to Lead and Deal detail. */}
                {/* Calls / Emails are activity types — they live in the
                    composer's type strip under Activity now. */}
                <TabsTrigger value="notes">Notes</TabsTrigger>
                {/* Leads tab sits BEFORE Deals by product rule —
                    every deal originates from a lead, so the lead
                    list is the upstream inventory the rep browses
                    first. Reuses the existing RelatedLeadsSection
                    (already fed the school id + school name) so no
                    new data plumbing is needed. */}
                <TabsTrigger value="leads">Leads</TabsTrigger>
                <TabsTrigger value="deals">
                  {/* Tab badge reflects the ACTIVE (ongoing) deals the
                      list below actually renders — the `deals.count`
                      stat counts every deal including won/lost, which
                      caused a "(3)" badge over a list that only showed
                      1 ongoing deal. Using `activeDeals.count` keeps
                      the header and the body telling the same story. */}
                  Deals ({stats?.activeDeals?.count || 0})
                </TabsTrigger>
                <TabsTrigger value="contacts">
                  Contacts ({school?.contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="quotes">
                  Quotes ({quotes?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="invoices">
                  Invoices ({invoices?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="installments">Installments</TabsTrigger>
                <TabsTrigger value="files">
                  <Paperclip className="h-4 w-4 mr-1" />
                  Files
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="mt-3">
              <TabsContent value="activities">
                {focusEntity ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                      <span className="text-sm">
                        Showing activities for{" "}
                        <span className="font-semibold">
                          {focusEntity.name}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          ({focusEntity.type})
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFocusEntity(null)}
                      >
                        Show all school activities
                      </Button>
                    </div>
                    <EngagementWorkspace
                      key={`${focusEntity.type}-${focusEntity.id}`}
                      scope={focusEntity.type}
                      leadId={
                        focusEntity.type === "lead" ? focusEntity.id : undefined
                      }
                      dealId={
                        focusEntity.type === "deal" ? focusEntity.id : undefined
                      }
                      isReadonly={!school.is_active}
                    />
                  </div>
                ) : (
                  // Composer opens on Call, matching the lead page, so the
                  // type strip is right there to pick from.
                  <ActivitiesTab school={school} composeType="call" />
                )}
              </TabsContent>

              {/* Compose, don't filter — same as the lead and deal pages.
                  The log below stays complete while the rep writes. */}
              <TabsContent value="notes">
                <ActivitiesTab school={school} composeType="note" />
              </TabsContent>


              <TabsContent value="leads">
                <RelatedLeadsSection
                  schoolId={school.id}
                  schoolName={school.name}
                  onSelectLead={(leadId, leadName) => {
                    setFocusEntity({ type: "lead", id: leadId, name: leadName });
                    setActiveTab("activities");
                  }}
                />
              </TabsContent>

              <TabsContent value="deals">
                <SchoolDealsTab
                  schoolId={id}
                  onSelectDeal={(dealId, dealName) => {
                    setFocusEntity({ type: "deal", id: dealId, name: dealName });
                    setActiveTab("activities");
                  }}
                />
              </TabsContent>

              <TabsContent value="contacts">
                <ContactsTab school={school} />
              </TabsContent>

            <TabsContent value="installments">
              <SchoolInstallmentsTab
                invoices={invoices}
                onPreviewInvoice={(invoiceId) => setPreviewInvoiceId(invoiceId)}
              />
            </TabsContent>

            <TabsContent value="files">
              <FilesTab entity="school" entityId={school.id} />
            </TabsContent>

            <TabsContent value="quotes">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Quotes</CardTitle>
                    <CardDescription>
                      {quotes?.length || 0} quotes for this school
                    </CardDescription>
                  </div>
                  <Button size="sm" asChild>
                    <Link to={`/quotes/new?schoolId=${school.id}`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Quote
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {!quotes || quotes.length === 0 ? (
                    <p className="text-center text-muted-foreground p-8">
                      No quotes yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {quotes.map((quote) => (
                        <div
                          key={quote.id}
                          className="flex justify-between items-center p-3 border rounded hover:bg-accent/50 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">{quote.quote_number}</p>
                            <p className="text-sm text-muted-foreground">
                              {quote.client_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right space-y-1">
                              <p className="font-semibold">
                                {formatCurrency(quote.total)}
                              </p>
                              <Badge
                                variant={
                                  quote.status === "Accepted"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {quote.status}
                              </Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewQuoteId(quote.id)}
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="invoices">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>
                      {invoices?.length || 0} invoices for this school
                    </CardDescription>
                  </div>
                  <Button size="sm" asChild>
                    <Link to={`/invoices/new?schoolId=${school.id}`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Invoice
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {!invoices || invoices.length === 0 ? (
                    <p className="text-center text-muted-foreground p-8">
                      No invoices yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {invoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="flex justify-between items-center p-3 border rounded hover:bg-accent/50 transition-colors"
                        >
                          <div className="space-y-1">
                            <p className="font-medium">
                              {invoice.invoice_number}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {invoice.client_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right space-y-1">
                              <p className="font-semibold">
                                {formatCurrency(invoice.total)}
                              </p>
                              <Badge
                                variant={
                                  invoice.status === "Paid"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {invoice.status}
                              </Badge>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewInvoiceId(invoice.id)}
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            </div>
          </Tabs>
        }
      />

      <EditSchoolModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        school={school}
      />
      <QuotePreviewModal
        open={!!previewQuoteId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewQuoteId(null);
        }}
        quoteId={previewQuoteId}
      />
      <InvoicePreviewModal
        open={!!previewInvoiceId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewInvoiceId(null);
        }}
        invoiceId={previewInvoiceId}
      />
    </div>
  );
};
