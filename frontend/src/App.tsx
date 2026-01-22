import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    if (location.pathname.startsWith("/app")) {
      return <Navigate to="/app/login" replace />;
    }
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/verify" element={<PublicVerifyPage />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell>
                <Dashboard />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/state"
          element={
            <ProtectedRoute>
              <AppShell>
                <StateReportPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/rto"
          element={
            <ProtectedRoute>
              <AppShell>
                <RtoReportPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/oem"
          element={
            <ProtectedRoute>
              <AppShell>
                <OemReportPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/dealer"
          element={
            <ProtectedRoute>
              <AppShell>
                <DealerReportPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/states"
          element={
            <ProtectedRoute>
              <AppShell>
                <StatesPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/states/:code/rto"
          element={
            <ProtectedRoute>
              <AppShell>
                <ManageRTOsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/oems"
          element={
            <ProtectedRoute>
              <AppShell>
                <OEMsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/dealers"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <DealersPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute>
              <AppShell>
                <AuditLogPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/system"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <SystemUsersPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppShell>
                <SettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/qr-generation"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <QRGenerationPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <InventoryPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/activate-qr"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <ActivateQrPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/search-qr"
          element={
            <ProtectedRoute>
              <AppShell>
                <SearchQrPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/search-cert"
          element={
            <ProtectedRoute>
              <AppShell>
                <SearchCertPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/download"
          element={
            <ProtectedRoute>
              <AppShell>
                <DownloadPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/certificate"
          element={
            <ProtectedRoute>
              <AppShell>
                <ErrorBoundary>
                  <CertificateGeneratorPage />
                </ErrorBoundary>
              </AppShell>
            </ProtectedRoute>
          }
        />
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
