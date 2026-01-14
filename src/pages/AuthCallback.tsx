import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { parseAuthCallback } from "../lib/google";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const exchangeCode = useAction(api.google.oauth.exchangeCodeForTokens);
  const getOrCreateUser = useMutation(api.auth.getOrCreateUser);

  const handleAuth = useCallback(async (code: string) => {
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const result = await exchangeCode({ code, redirectUri });

      const userId = await getOrCreateUser({
        googleId: result.googleId,
        email: result.email,
        name: result.name,
      });

      sessionStorage.setItem(
        "auth",
        JSON.stringify({
          userId,
          googleId: result.googleId,
          email: result.email,
          name: result.name,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          tokenExpiry: Date.now() + result.expiresIn * 1000,
        })
      );

      navigate("/dashboard");
    } catch (err) {
      console.error("Auth error:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  }, [exchangeCode, getOrCreateUser, navigate]);

  useEffect(() => {
    const { code, error: authError } = parseAuthCallback();

    if (authError) {
      setError(authError);
      setLoading(false);
      return;
    }

    if (!code) {
      setError("No authorization code received");
      setLoading(false);
      return;
    }

    handleAuth(code);
  }, [handleAuth]);

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Authentication Error</h2>
          <p className="error-text">{error}</p>
          <button onClick={() => navigate("/")} className="google-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Authenticating...</h2>
          <p>Please wait while we complete sign in.</p>
        </div>
      </div>
    );
  }

  return null;
}
