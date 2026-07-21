import { useState } from "react";
import { useParams, Link } from "react-router";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
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
  Paperclip,
  Plus,
  Map,
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
    <div>
      <PageHeader
        hasBackButton
        title={school.name}
        subtitle={
          <div className="flex items-center gap-2">
            <div className="flex items-center text-muted-foreground">
              <Map className="h-4 w-4" />
              <p className="text-sm">
                {school.district}, {school.province}
              </p>
            </div>
            {school.is_active ? (
              <Badge variant="default">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        }
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit School
          </Button>
        }
      />
      <Container className="p-4 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                {stats?.activeDeals.count ?? 0}
              </div>
              <p className="text-sm text-muted-foreground">
                {formatCurrency(stats?.activeDeals.totalValue ?? 0)} total value
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Enrollment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                {school?.student_count
                  ? school.student_count.toLocaleString()
                  : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open Quotes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-muted-foreground" />
                {stats?.openQuotes.count ?? 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                {formatCurrency(stats?.outstandingInvoices.totalValue ?? 0)}
              </div>
              <p className="text-sm text-muted-foreground">
                {stats?.outstandingInvoices.count ?? 0} pending invoices
              </p>
            </CardContent>
          </Card>
        </div>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="deals">
              Deals ({stats?.deals?.count || 0})
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
            {/* <TabsTrigger value="activity">
            <Activity className="h-4 w-4 mr-1" />
            Activity
          </TabsTrigger> */}
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview">
              <OverviewTab school={school} />
            </TabsContent>

            <TabsContent value="deals">
              <SchoolDealsTab schoolId={id} />
            </TabsContent>

            <TabsContent value="contacts">
              <ContactsTab school={school} />
            </TabsContent>

            <TabsContent value="activities">
              <ActivitiesTab school={school} />
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
      </Container>

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
