import { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
  useParams,
} from "react-router";
import DashboardLayout from "./components/layout/dashboard-layout";
import { ProtectedRoute } from "./components/protected-route";
import ForgotPasswordPage from "./pages/auth/forgot-password";
import LoginPage from "./pages/auth/login";
import ResetPasswordPage from "./pages/auth/reset-password";
import { AppProviders } from "./providers";
import { useAuthStore } from "./stores/use-auth-store";
import MainDashboardPage from "./pages/dashboard/dashboard-page";
import SettingsPage from "./pages/admin/settings-page";
import LeadsManagementPage from "./pages/leads/leads-management-page";
import CreateNewLeadPage from "./pages/leads/create-new-lead";
import ViewLeadPage from "./pages/leads/view-lead-page";
import SchoolsManagementPage from "./pages/schools/schools-management-page";
import ViewSchoolPage from "./pages/schools/view-school-page";
import FinancePlansPage from "./pages/admin/finance-plans-page";
import ProductsPage from "./pages/admin/products-page";
import StaffPage from "./pages/admin/staff-page";
import ProfilePage from "./pages/profile/profile-page";
import EmailAccountsPage from "./pages/profile/email-accounts-page";
import QuotesPage from "./pages/quotes/quotes-page";
import CreateQuotePage from "./pages/quotes/create-quote-page";
import InvoicesPage from "./pages/invoices/invoices-page";
import CreateInvoicePage from "./pages/invoices/create-invoice-page";
import InvoiceSchedulePage from "./pages/invoices/invoice-schedule-page";
import PaymentsPage from "./pages/payments/manage-payments";
import CollectionsPage from "./pages/collections/collections-page";
import PipelineStagesPage from "./pages/pipeline/pipeline-stages-page";
import ActivitiesPage from "./pages/activities/activities-page";
import ReportsPage from "./pages/reports/view-reports-page";
import ViewDealDetailsPage from "./pages/deals/view-deal-details";
import ManageRolesAndPermissionPage from "./pages/roles/manage-roles-and-permissions";
import EmailSequencesPage from "./pages/admin/email-sequences-page";
import EmailTemplatesPage from "./pages/admin/email-templates-page";
import CalendarConnectionsPage from "./pages/profile/calendar-connections-page";
import VideoConnectionsPage from "./pages/profile/video-connections-page";
import SchedulingLinksPage from "./pages/scheduling/scheduling-links-page";
import PublicBookingPage from "./pages/public/book-page";
import EscalationsQueuePage from "./pages/management/escalations-queue-page";
import DuplicatesQueuePage from "./pages/management/duplicates-queue-page";
import ApprovalQueuePage from "./pages/admin/approval-queue-page";
import ComplianceReportPage from "./pages/admin/compliance-report-page";
import RequisitionsPage from "./pages/requisitions/requisitions-page";
import RequisitionDetailPage from "./pages/requisitions/requisition-detail-page";
import CampaignsPage from "./pages/campaigns/campaigns-page";
import CampaignDetailPage from "./pages/campaigns/campaign-detail-page";
import WhatsNewPage from "./pages/whats-new/whats-new-page";
import BugReportsPage from "./pages/bug-reports/bug-reports-page";
import NotificationsPage from "./pages/notifications/notifications-page";
import NotFoundPage from "./pages/not-found-page";
import { ErrorBoundary } from "./components/error-boundary";

function InvoiceScheduleAliasRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/invoices/${id}/schedule` : "/invoices"} replace />;
}

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  return (
    <AppProviders>
      <ErrorBoundary>
        <BrowserRouter basename="/">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Calendly-style booking page — no auth, anyone with the slug can land here */}
          <Route path="/book/:slug" element={<PublicBookingPage />} />

          {/* Protected routes with layout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
            >
            <Route index element={<MainDashboardPage />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/change-password" element={<ProfilePage />} />
            <Route path="/leads" element={<Outlet />}>
              <Route index element={<LeadsManagementPage />} />
              <Route path="new" element={<CreateNewLeadPage />} />
              <Route path=":id" element={<ViewLeadPage />} />
            </Route>
            <Route path="/schools" element={<Outlet />}>
              <Route index element={<SchoolsManagementPage />} />
              <Route path=":id" element={<ViewSchoolPage />} />
            </Route>
            <Route path="/quotes" element={<Outlet />}>
              <Route index element={<QuotesPage />} />
              <Route path="new" element={<CreateQuotePage />} />
            </Route>
            <Route path="/invoices" element={<Outlet />}>
              <Route index element={<InvoicesPage />} />
              <Route path="new" element={<CreateInvoicePage />} />
              <Route path=":id/schedule" element={<InvoiceSchedulePage />} />
            </Route>
            <Route
              path="/invoice/:id/schedule"
              element={<InvoiceScheduleAliasRedirect />}
            />
            <Route path="/deals" element={<Outlet />}>
              <Route path=":id" element={<ViewDealDetailsPage />} />
            </Route>
            <Route path="/payments" element={<PaymentsPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/pipeline" element={<PipelineStagesPage />} />
            {/* Tasks retired as a standalone module — it was always a
                sub-entity of Activity (1:1 via activity_id). Route
                preserved for backwards compatibility; redirects to the
                Activities page with type=task pre-selected. */}
            <Route
              path="/tasks"
              element={<Navigate to="/activities?type=task" replace />}
            />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/whats-new" element={<WhatsNewPage />} />
            <Route path="/bug-reports" element={<BugReportsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/finance-plans" element={<FinancePlansPage />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/users" element={<StaffPage />} />
            <Route path="/admin/roles-permissions" element={<ManageRolesAndPermissionPage />} />
            <Route path="/admin/email-sequences" element={<EmailSequencesPage />} />
            <Route path="/admin/email-templates" element={<EmailTemplatesPage />} />
            <Route path="/admin/approval-queue" element={<ApprovalQueuePage />} />
            <Route path="/admin/compliance-report" element={<ComplianceReportPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/email-accounts" element={<EmailAccountsPage />} />
            <Route path="/profile/calendar-connections" element={<CalendarConnectionsPage />} />
            <Route path="/profile/video-connections" element={<VideoConnectionsPage />} />
            <Route path="/scheduling-links" element={<SchedulingLinksPage />} />
            <Route path="/requisitions" element={<Outlet />}>
              <Route index element={<RequisitionsPage />} />
              <Route path=":id" element={<RequisitionDetailPage />} />
            </Route>
            <Route path="/campaigns" element={<Outlet />}>
              <Route index element={<CampaignsPage />} />
              <Route path=":id" element={<CampaignDetailPage />} />
            </Route>
            {/* Management control layer (Phases 5 + 8) */}
            <Route path="/management" element={<Outlet />}>
              <Route
                path="escalations"
                element={<EscalationsQueuePage />}
              />
              <Route
                path="duplicates"
                element={<DuplicatesQueuePage />}
              />
            </Route>
            {/* APP-404-EB: catch-all inside the layout so an unknown authed
                URL shows a proper 404 instead of a blank content area. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </AppProviders>
  );
}

export default App;
