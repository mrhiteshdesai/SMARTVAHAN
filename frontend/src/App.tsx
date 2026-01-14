import { Routes, Route, Navigate } from "react-router-dom";
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
import { CertificateGeneratorPage } from "./pages/CertificateGeneratorPage";
import { ErrorBoundary } from "./ui/ErrorBoundary";

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
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
    </AuthProvider>
  );
}
