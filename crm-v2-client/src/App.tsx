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
import QuotesPage from "./pages/quotes/quotes-page";
import CreateQuotePage from "./pages/quotes/create-quote-page";
import InvoicesPage from "./pages/invoices/invoices-page";
import CreateInvoicePage from "./pages/invoices/create-invoice-page";
import InvoiceSchedulePage from "./pages/invoices/invoice-schedule-page";
import PaymentsPage from "./pages/payments/manage-payments";
import CollectionsPage from "./pages/collections/collections-page";
import PipelineStagesPage from "./pages/pipeline/pipeline-stages-page";
import ActivitiesPage from "./pages/activities/activities-page";
import ViewTasksPage from "./pages/tasks/view-tasks-page";
import ReportsPage from "./pages/reports/view-reports-page";
import ViewDealDetailsPage from "./pages/deals/view-deal-details";
import ManageRolesAndPermissionPage from "./pages/roles/manage-roles-and-permissions";

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
      <BrowserRouter basename="/">
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

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
            <Route path="/tasks" element={<ViewTasksPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/finance-plans" element={<FinancePlansPage />} />
            <Route path="/admin/products" element={<ProductsPage />} />
            <Route path="/admin/users" element={<StaffPage />} />
            <Route path="/admin/roles-permissions" element={<ManageRolesAndPermissionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
}

export default App;
