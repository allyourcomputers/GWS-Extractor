const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  throw new Error("Missing VITE_GOOGLE_CLIENT_ID environment variable");
}

const REDIRECT_URI = `${window.location.origin}/auth/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export function getGoogleAuthUrl(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function parseAuthCallback(): { code: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search);

  // Validate state to prevent CSRF
  const state = params.get("state");
  const storedState = sessionStorage.getItem("oauth_state");

  if (state !== storedState) {
    return { code: null, error: "State mismatch - invalid OAuth callback" };
  }

  // Clear stored state
  sessionStorage.removeItem("oauth_state");

  // Check for OAuth errors
  const error = params.get("error");
  if (error) {
    const errorDesc = params.get("error_description") || error;
    return { code: null, error: errorDesc };
  }

  return { code: params.get("code"), error: null };
}
