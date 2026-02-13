import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

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
  getValidAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const refreshAccessToken = useAction(api.google.oauth.refreshAccessToken);

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

  const getValidAccessToken = useCallback(async (): Promise<string> => {
    if (!auth?.accessToken || !auth?.refreshToken) {
      throw new Error("Not authenticated");
    }

    // If token is still valid, return it
    if (auth.tokenExpiry && auth.tokenExpiry > Date.now() + REFRESH_BUFFER_MS) {
      return auth.accessToken;
    }

    // Token expired or expiring soon - refresh it
    const refreshed = await refreshAccessToken({
      refreshToken: auth.refreshToken,
    });

    const newExpiry = Date.now() + refreshed.expiresIn * 1000;
    const updatedAuth = {
      ...auth,
      accessToken: refreshed.accessToken,
      tokenExpiry: newExpiry,
    };

    sessionStorage.setItem("auth", JSON.stringify(updatedAuth));
    setAuth(updatedAuth);

    return refreshed.accessToken;
  }, [auth, refreshAccessToken]);

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
        getValidAccessToken,
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
