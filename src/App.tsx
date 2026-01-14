import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import ConnectionSettings from "./pages/ConnectionSettings";
import DomainFilters from "./pages/DomainFilters";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/connections/:id"
        element={
          <ProtectedRoute>
            <ConnectionSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/connections/:id/domains"
        element={
          <ProtectedRoute>
            <DomainFilters />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
