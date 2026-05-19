import { Routes, Route, Navigate, useLocation, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AppShell from "./app/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import StatesPage from "./pages/states/StatesPage";
import ManageRTOsPage from "./pages/states/ManageRTOsPage";
import OEMsPage from "./pages/oems/OEMsPage";
import DealersPage from "./pages/dealers/DealersPage";
import SystemUsersPage from "./pages/users/SystemUsersPage";
import SettingsPage from "./pages/SettingsPage";
import { QRGenerationPage } from "./pages/qr/QRGenerationPage";
import ActivateQrPage from "./pages/ActivateQrPage";
import { CertificateGeneratorPage } from "./pages/CertificateGeneratorPage";
import SearchQrPage from "./pages/SearchQrPage";
import SearchCertPage from "./pages/SearchCertPage";
import DownloadPage from "./pages/DownloadPage";
import StateReportPage from "./pages/reports/StateReportPage";
import RtoReportPage from "./pages/reports/RtoReportPage";
import PassingRtoReportPage from "./pages/reports/PassingRtoReportPage";
import OemReportPage from "./pages/reports/OemReportPage";
import DealerReportPage from "./pages/reports/DealerReportPage";
import AuditLogPage from "./pages/AuditLogPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import MobileSplash from "./mobile/MobileSplash";
import MobileLogin from "./mobile/MobileLogin";
import MobileHome from "./mobile/MobileHome";
import MobileScan from "./mobile/MobileScan";
import MobileForm from "./mobile/MobileForm";
import PublicVerifyPage from "./pages/PublicVerifyPage";
import LandingPage from "./pages/LandingPage";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated, user, signOut } = useAuth();
  const location = useLocation();
  const isGhostMode = localStorage.getItem("isGhostMode") === "true";

  if (!isAuthenticated) {
    if (location.pathname.startsWith("/app")) {
      return <Navigate to="/app/login" replace />;
    }
    if (location.pathname.startsWith("/control/rp")) {
      return <Navigate to="/control/rp/login" replace />;
    }
    if (location.pathname.startsWith("/control")) {
      return <Navigate to="/control/login" replace />;
    }
    return <Navigate to="/" replace />;
  }

  // Ghost Mode Restrictions
  if (isGhostMode) {
    if (user?.role !== "SUPER_ADMIN" && user?.role !== "GHOST_ADMIN") {
      // Not authorized for ghost mode
      signOut(); // Force logout to prevent loop or invalid state
      return <Navigate to="/login" replace />;
    }
  } else {
    // Main Dashboard Restrictions
    if (user?.role === "GHOST_ADMIN") {
      // Ghost Admin cannot access main dashboard
      signOut();
      return <Navigate to="/login" replace />;
    }
  }

  return children;
}

function GhostModeSync() {
  const location = useLocation();
  const shouldBeGhost = location.pathname.startsWith("/control/rp");
  const current = localStorage.getItem("isGhostMode") === "true";
  if (shouldBeGhost !== current) {
    if (shouldBeGhost) localStorage.setItem("isGhostMode", "true");
    else localStorage.removeItem("isGhostMode");
  }
  return null;
}

function DashboardLayout() {
  return (
    <ProtectedRoute>
      <AppShell>
        <Outlet />
      </AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GhostModeSync />
      <Routes>
        <Route path="/verify" element={<PublicVerifyPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/dealer-registration" element={<LandingPage mode="dealer-registration" />} />
        <Route path="/login" element={<Navigate to="/control/login" replace />} />
        <Route path="/control/login" element={<Login />} />
        <Route path="/control/rp/login" element={<Login />} />

        <Route path="/control" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="reports/state" element={<StateReportPage />} />
          <Route path="reports/rto" element={<RtoReportPage />} />
          <Route path="reports/passing-rto" element={<PassingRtoReportPage />} />
          <Route path="reports/oem" element={<OemReportPage />} />
          <Route path="reports/dealer" element={<DealerReportPage />} />
          <Route path="users/states" element={<StatesPage />} />
          <Route path="users/states/:code/rto" element={<ManageRTOsPage />} />
          <Route path="users/oems" element={<OEMsPage />} />
          <Route
            path="users/dealers"
            element={
              <ErrorBoundary>
                <DealersPage />
              </ErrorBoundary>
            }
          />
          <Route path="audit" element={<AuditLogPage />} />
          <Route
            path="users/system"
            element={
              <ErrorBoundary>
                <SystemUsersPage />
              </ErrorBoundary>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="qr-generation"
            element={
              <ErrorBoundary>
                <QRGenerationPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="inventory"
            element={
              <ErrorBoundary>
                <InventoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="activate-qr"
            element={
              <ErrorBoundary>
                <ActivateQrPage />
              </ErrorBoundary>
            }
          />
          <Route path="search-qr" element={<SearchQrPage />} />
          <Route path="search-cert" element={<SearchCertPage />} />
          <Route path="download" element={<DownloadPage />} />
          <Route
            path="certificate"
            element={
              <ErrorBoundary>
                <CertificateGeneratorPage />
              </ErrorBoundary>
            }
          />
        </Route>

        <Route path="/control/rp" element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="reports/state" element={<StateReportPage />} />
          <Route path="reports/rto" element={<RtoReportPage />} />
          <Route path="reports/passing-rto" element={<PassingRtoReportPage />} />
          <Route path="reports/oem" element={<OemReportPage />} />
          <Route path="reports/dealer" element={<DealerReportPage />} />
          <Route path="users/states" element={<StatesPage />} />
          <Route path="users/states/:code/rto" element={<ManageRTOsPage />} />
          <Route path="users/oems" element={<OEMsPage />} />
          <Route
            path="users/dealers"
            element={
              <ErrorBoundary>
                <DealersPage />
              </ErrorBoundary>
            }
          />
          <Route path="audit" element={<AuditLogPage />} />
          <Route
            path="users/system"
            element={
              <ErrorBoundary>
                <SystemUsersPage />
              </ErrorBoundary>
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="qr-generation"
            element={
              <ErrorBoundary>
                <QRGenerationPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="inventory"
            element={
              <ErrorBoundary>
                <InventoryPage />
              </ErrorBoundary>
            }
          />
          <Route
            path="activate-qr"
            element={
              <ErrorBoundary>
                <ActivateQrPage />
              </ErrorBoundary>
            }
          />
          <Route path="search-qr" element={<SearchQrPage />} />
          <Route path="search-cert" element={<SearchCertPage />} />
          <Route path="download" element={<DownloadPage />} />
          <Route
            path="certificate"
            element={
              <ErrorBoundary>
                <CertificateGeneratorPage />
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
      <Routes>
        <Route path="/app" element={<MobileSplash />} />
        <Route path="/app/login" element={<MobileLogin />} />
        <Route
          path="/app/home"
          element={
            <ProtectedRoute>
              <MobileHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/scan"
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <MobileScan />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/form"
          element={
            <ProtectedRoute>
              <MobileForm />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
