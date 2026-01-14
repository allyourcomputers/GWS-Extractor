import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AuthState {
  userId: string | null;
  googleId: string | null;
  email: string | null;
  name: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: number | null;
}

interface AuthContextType {
  auth: AuthState | null;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("auth");
      if (stored) {
        setAuth(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to restore auth state:", error);
      sessionStorage.removeItem("auth");
    }
  }, []);

  const logout = () => {
    sessionStorage.removeItem("auth");
    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        isAuthenticated: auth !== null,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
