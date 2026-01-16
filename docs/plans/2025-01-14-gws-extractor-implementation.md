# GWS Email Address Extractor - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an application that extracts sender email addresses from a Gmail mailbox and exports them to Google Sheets.

**Architecture:** React frontend (Vite) with Convex cloud backend. Google OAuth 2.0 for Gmail/Sheets API access. Scheduled sync jobs with manual trigger option. Per-user data isolation.

**Tech Stack:** React 18, Vite, Convex, Google APIs (Gmail, Sheets, OAuth), TypeScript, Docker

---

## Post-Implementation Updates

> **Status:** This plan has been fully implemented. The following enhancements were added after the initial implementation:

### Batch Processing Improvements
- Increased batch size from 50 to **200 messages per batch**
- Reduced delay between batches from 2 seconds to **500ms**
- Added **race condition protection** - status is re-checked before updates to prevent sync/delete conflicts

### New Sync Statuses
- Added `"deleting"` status - shown when connection is being deleted
- Added `"resetting"` status - shown during full reset operation

### Batch Deletion
- Connections are now deleted in **batches of 500 records** to avoid Convex read limits (4096 max)
- Deletes domains, synced emails, addresses, then the connection itself
- Shows "Deleting..." status during the process

### Reset Functionality
- **Reset button** - clears stuck sync status while preserving synced data
- **Full Reset** - deletes all synced emails to start fresh (runs in background)

### Stuck Detection
- Added `syncStartedAt` field to track when sync began
- UI shows warning if sync has been running **2+ minutes with no progress**
- Prevents false "stuck" warnings on newly started syncs

### Time Remaining Estimates
- Displays estimated time remaining during sync (e.g., "~2h 15m remaining")
- Calculated from actual processing rate: `(remaining messages / processed messages) * elapsed time`
- Only shows after first batch completes (when there's enough data to estimate)
- Updates in real-time as sync progresses

### OAuth Scope Updates
- Added `drive.readonly` scope for listing available spreadsheets
- Required for the spreadsheet dropdown to work

### Spreadsheet Creation
- Users can create new spreadsheets directly from the app
- Added "+ Create new spreadsheet" option in the connection settings

### Scheduler Protection
- Cron job now skips connections with `"deleting"` or `"resetting"` status
- Prevents sync from starting on connections being deleted

---

## Phase 1: Project Setup

### Task 1: Initialize Node.js Project

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize package.json**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm init -y
```

**Step 2: Create .gitignore**

Create file `.gitignore`:
```
node_modules/
dist/
.env
.env.local
.convex/
```

**Step 3: Create .env.example**

Create file `.env.example`:
```
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Convex (auto-populated by npx convex dev)
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
```

**Step 4: Initialize git repository**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && git init
```

**Step 5: Commit**

Run:
```bash
git add . && git commit -m "chore: initialize project"
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install React and Vite**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm install react react-dom react-router-dom
```

**Step 2: Install dev dependencies**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```

**Step 3: Install Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm install convex
```

**Step 4: Install Google API client**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm install googleapis
```

**Step 5: Commit**

Run:
```bash
git add . && git commit -m "chore: install dependencies"
```

---

### Task 3: Configure Vite and TypeScript

**Files:**
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`

**Step 1: Create vite.config.ts**

Create file `vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
```

**Step 2: Create tsconfig.json**

Create file `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 3: Create tsconfig.node.json**

Create file `tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 4: Create index.html**

Create file `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GWS Email Extractor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 5: Commit**

Run:
```bash
git add . && git commit -m "chore: configure vite and typescript"
```

---

### Task 4: Create React Entry Point

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

**Step 1: Create src directory**

Run:
```bash
mkdir -p /Users/mjhorswood/sites/GWS-Extractor/src
```

**Step 2: Create src/main.tsx**

Create file `src/main.tsx`:
```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
```

**Step 3: Create src/App.tsx**

Create file `src/App.tsx`:
```typescript
function App() {
  return (
    <div>
      <h1>GWS Email Extractor</h1>
      <p>Setup complete. Ready for development.</p>
    </div>
  );
}

export default App;
```

**Step 4: Create src/index.css**

Create file `src/index.css`:
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #f5f5f5;
}
```

**Step 5: Commit**

Run:
```bash
git add . && git commit -m "feat: create react entry point"
```

---

### Task 5: Initialize Convex

**Files:**
- Create: `convex/` directory with initial files

**Step 1: Run Convex init**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex init
```

Note: This will prompt to create a new project or link existing. Choose "create new project" and name it "gws-extractor".

**Step 2: Verify convex directory created**

Run:
```bash
ls /Users/mjhorswood/sites/GWS-Extractor/convex/
```

Expected: See `_generated/`, `tsconfig.json`, and sample files

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "chore: initialize convex"
```

---

## Phase 2: Database Schema

### Task 6: Define Convex Schema

**Files:**
- Create: `convex/schema.ts`

**Step 1: Create schema.ts**

Create file `convex/schema.ts`:
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
  }).index("by_google_id", ["googleId"]),

  connections: defineTable({
    userId: v.id("users"),
    name: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    mailboxFolder: v.string(),
    sheetsId: v.string(),
    sheetTab: v.string(),
    syncSchedule: v.string(),
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.string(),
    lastError: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  filteredDomains: defineTable({
    connectionId: v.id("connections"),
    domain: v.string(),
  }).index("by_connection", ["connectionId"]),

  syncedEmails: defineTable({
    connectionId: v.id("connections"),
    messageId: v.string(),
    syncedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_message", ["connectionId", "messageId"]),

  addresses: defineTable({
    connectionId: v.id("connections"),
    email: v.string(),
    name: v.string(),
    firstContactAt: v.number(),
    emailCount: v.number(),
    lastExportedCount: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_email", ["connectionId", "email"]),
});
```

**Step 2: Push schema to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

Expected: Schema pushed successfully

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: define database schema"
```

---

## Phase 3: User Authentication

### Task 7: Create Auth Functions

**Files:**
- Create: `convex/auth.ts`

**Step 1: Create auth.ts**

Create file `convex/auth.ts`:
```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getOrCreateUser = mutation({
  args: {
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_google_id", (q) => q.eq("googleId", args.googleId))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("users", {
      googleId: args.googleId,
      email: args.email,
      name: args.name,
    });
  },
});

export const getUserByGoogleId = query({
  args: { googleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_google_id", (q) => q.eq("googleId", args.googleId))
      .first();
  },
});
```

**Step 2: Push functions to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add user authentication functions"
```

---

### Task 8: Create Google OAuth Helper (Frontend)

**Files:**
- Create: `src/lib/google.ts`

**Step 1: Create lib directory**

Run:
```bash
mkdir -p /Users/mjhorswood/sites/GWS-Extractor/src/lib
```

**Step 2: Create google.ts**

Create file `src/lib/google.ts`:
```typescript
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function parseAuthCallback(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}
```

**Step 3: Update .env.example**

Modify `.env.example` to add:
```
VITE_GOOGLE_CLIENT_ID=
```

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: add google oauth helper"
```

---

### Task 9: Create OAuth Token Exchange Action

**Files:**
- Create: `convex/google/oauth.ts`

**Step 1: Create google directory**

Run:
```bash
mkdir -p /Users/mjhorswood/sites/GWS-Extractor/convex/google
```

**Step 2: Create oauth.ts**

Create file `convex/google/oauth.ts`:
```typescript
import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const exchangeCodeForTokens = action({
  args: { code: v.string(), redirectUri: v.string() },
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await tokenResponse.json();

    // Fetch user info
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userResponse.ok) {
      throw new Error("Failed to fetch user info");
    }

    const userInfo = await userResponse.json();

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
    };
  },
});

export const refreshAccessToken = action({
  args: { refreshToken: v.string() },
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: args.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json();

    return {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    };
  },
});
```

**Step 3: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: add oauth token exchange action"
```

---

### Task 10: Create Login Page

**Files:**
- Create: `src/pages/Login.tsx`

**Step 1: Create pages directory**

Run:
```bash
mkdir -p /Users/mjhorswood/sites/GWS-Extractor/src/pages
```

**Step 2: Create Login.tsx**

Create file `src/pages/Login.tsx`:
```typescript
import { getGoogleAuthUrl } from "../lib/google";

export default function Login() {
  const handleLogin = () => {
    window.location.href = getGoogleAuthUrl();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>GWS Email Extractor</h1>
        <p>Extract email addresses from your Gmail and export to Google Sheets</p>
        <button onClick={handleLogin} className="google-button">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Add login styles to index.css**

Append to `src/index.css`:
```css

.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 400px;
}

.login-card h1 {
  margin-bottom: 0.5rem;
  color: #333;
}

.login-card p {
  color: #666;
  margin-bottom: 1.5rem;
}

.google-button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.google-button:hover {
  background: #3367d6;
}
```

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: create login page"
```

---

### Task 11: Create Auth Callback Page

**Files:**
- Create: `src/pages/AuthCallback.tsx`

**Step 1: Create AuthCallback.tsx**

Create file `src/pages/AuthCallback.tsx`:
```typescript
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { parseAuthCallback } from "../lib/google";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const exchangeCode = useAction(api.google.oauth.exchangeCodeForTokens);
  const getOrCreateUser = useMutation(api.auth.getOrCreateUser);

  useEffect(() => {
    const code = parseAuthCallback();

    if (!code) {
      setError("No authorization code received");
      return;
    }

    const handleAuth = async () => {
      try {
        const redirectUri = `${window.location.origin}/auth/callback`;
        const result = await exchangeCode({ code, redirectUri });

        // Create or get user
        const userId = await getOrCreateUser({
          googleId: result.googleId,
          email: result.email,
          name: result.name,
        });

        // Store auth info in session storage
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
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    handleAuth();
  }, []);

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h2>Authentication Error</h2>
          <p style={{ color: "red" }}>{error}</p>
          <button onClick={() => navigate("/")} className="google-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h2>Authenticating...</h2>
        <p>Please wait while we complete sign in.</p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

Run:
```bash
git add . && git commit -m "feat: create auth callback page"
```

---

### Task 12: Create Auth Context

**Files:**
- Create: `src/lib/AuthContext.tsx`

**Step 1: Create AuthContext.tsx**

Create file `src/lib/AuthContext.tsx`:
```typescript
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
    const stored = sessionStorage.getItem("auth");
    if (stored) {
      setAuth(JSON.parse(stored));
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
```

**Step 2: Commit**

Run:
```bash
git add . && git commit -m "feat: create auth context"
```

---

### Task 13: Set Up Routing

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Step 1: Update main.tsx**

Replace `src/main.tsx`:
```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext";
import App from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>
);
```

**Step 2: Update App.tsx**

Replace `src/App.tsx`:
```typescript
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";

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
            <div>Dashboard (coming soon)</div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
```

**Step 3: Verify app builds**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm run dev
```

Expected: App starts without errors

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: set up routing with protected routes"
```

---

## Phase 4: Connection Management

### Task 14: Create Connection CRUD Functions

**Files:**
- Create: `convex/connections.ts`

**Step 1: Create connections.ts**

Create file `convex/connections.ts`:
```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    mailboxFolder: v.string(),
    sheetsId: v.string(),
    sheetTab: v.string(),
    syncSchedule: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("connections", {
      ...args,
      isActive: true,
      syncStatus: "idle",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("connections"),
    name: v.optional(v.string()),
    mailboxFolder: v.optional(v.string()),
    sheetsId: v.optional(v.string()),
    sheetTab: v.optional(v.string()),
    syncSchedule: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    // Delete related data first
    const domains = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const domain of domains) {
      await ctx.db.delete(domain._id);
    }

    const emails = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const email of emails) {
      await ctx.db.delete(email._id);
    }

    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const address of addresses) {
      await ctx.db.delete(address._id);
    }

    await ctx.db.delete(args.id);
  },
});

export const updateSyncStatus = mutation({
  args: {
    id: v.id("connections"),
    syncStatus: v.string(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const updateTokens = mutation({
  args: {
    id: v.id("connections"),
    accessToken: v.string(),
    tokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add connection crud functions"
```

---

### Task 15: Create Domain Filter Functions

**Files:**
- Create: `convex/domains.ts`

**Step 1: Create domains.ts**

Create file `convex/domains.ts`:
```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
  },
});

export const add = mutation({
  args: {
    connectionId: v.id("connections"),
    domain: v.string(),
  },
  handler: async (ctx, args) => {
    // Normalize domain (lowercase, trim)
    const domain = args.domain.toLowerCase().trim();

    // Check if already exists
    const existing = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .filter((q) => q.eq(q.field("domain"), domain))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("filteredDomains", {
      connectionId: args.connectionId,
      domain,
    });
  },
});

export const addBulk = mutation({
  args: {
    connectionId: v.id("connections"),
    domains: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();

    const existingDomains = new Set(existing.map((d) => d.domain));

    for (const domain of args.domains) {
      const normalized = domain.toLowerCase().trim();
      if (normalized && !existingDomains.has(normalized)) {
        await ctx.db.insert("filteredDomains", {
          connectionId: args.connectionId,
          domain: normalized,
        });
        existingDomains.add(normalized);
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("filteredDomains") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add domain filter functions"
```

---

### Task 16: Create Address Functions

**Files:**
- Create: `convex/addresses.ts`

**Step 1: Create addresses.ts**

Create file `convex/addresses.ts`:
```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
  },
});

export const count = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
    return addresses.length;
  },
});

export const upsert = mutation({
  args: {
    connectionId: v.id("connections"),
    email: v.string(),
    name: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_email", (q) =>
        q.eq("connectionId", args.connectionId).eq("email", args.email)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailCount: existing.emailCount + 1,
        // Update name if we have a better one (non-empty and different)
        ...(args.name && args.name !== existing.name ? { name: args.name } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("addresses", {
      connectionId: args.connectionId,
      email: args.email,
      name: args.name,
      firstContactAt: args.timestamp,
      emailCount: 1,
      lastExportedCount: 0,
    });
  },
});

export const markExported = mutation({
  args: {
    ids: v.array(v.id("addresses")),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const address = await ctx.db.get(id);
      if (address) {
        await ctx.db.patch(id, {
          lastExportedCount: address.emailCount,
        });
      }
    }
  },
});

export const getUnexported = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();

    return addresses.filter((a) => a.emailCount > a.lastExportedCount);
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add address functions"
```

---

## Phase 5: Gmail Sync

### Task 17: Create Gmail API Wrapper

**Files:**
- Create: `convex/google/gmail.ts`

**Step 1: Create gmail.ts**

Create file `convex/google/gmail.ts`:
```typescript
import { action } from "../_generated/server";
import { v } from "convex/values";

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
  };
}

export const listMessages = action({
  args: {
    accessToken: v.string(),
    labelId: v.string(),
    afterTimestamp: v.optional(v.number()),
    pageToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = `in:${args.labelId}`;
    if (args.afterTimestamp) {
      const date = new Date(args.afterTimestamp);
      const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
      query += ` after:${dateStr}`;
    }

    const params = new URLSearchParams({
      q: query,
      maxResults: "100",
    });

    if (args.pageToken) {
      params.set("pageToken", args.pageToken);
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data = await response.json();

    return {
      messages: (data.messages || []) as GmailMessage[],
      nextPageToken: data.nextPageToken as string | undefined,
    };
  },
});

export const getMessage = action({
  args: {
    accessToken: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${args.messageId}?format=metadata&metadataHeaders=From`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data: GmailMessageDetail = await response.json();

    const fromHeader = data.payload.headers.find(
      (h) => h.name.toLowerCase() === "from"
    );

    return {
      id: data.id,
      timestamp: parseInt(data.internalDate, 10),
      from: fromHeader?.value || "",
    };
  },
});

export const listLabels = action({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/labels",
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gmail API error: ${error}`);
    }

    const data = await response.json();

    return data.labels as Array<{ id: string; name: string; type: string }>;
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add gmail api wrapper"
```

---

### Task 18: Create Sync Logic

**Files:**
- Create: `convex/sync.ts`

**Step 1: Create sync.ts**

Create file `convex/sync.ts`:
```typescript
import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

function parseEmailAddress(fromHeader: string): { email: string; name: string } {
  // Handle formats like: "John Doe <john@example.com>" or "john@example.com"
  const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);

  if (match) {
    return {
      name: (match[1] || "").trim(),
      email: match[2].toLowerCase().trim(),
    };
  }

  // Fallback: treat whole string as email
  return {
    name: "",
    email: fromHeader.toLowerCase().trim(),
  };
}

function getDomainFromEmail(email: string): string {
  const parts = email.split("@");
  return parts[1] || "";
}

export const checkIfSynced = internalQuery({
  args: {
    connectionId: v.id("connections"),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("syncedEmails")
      .withIndex("by_message", (q) =>
        q.eq("connectionId", args.connectionId).eq("messageId", args.messageId)
      )
      .first();
    return existing !== null;
  },
});

export const markSynced = internalMutation({
  args: {
    connectionId: v.id("connections"),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("syncedEmails", {
      connectionId: args.connectionId,
      messageId: args.messageId,
      syncedAt: Date.now(),
    });
  },
});

export const getFilteredDomains = internalQuery({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const domains = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
    return new Set(domains.map((d) => d.domain));
  },
});

export const syncConnection = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    // Get connection details
    const connection = await ctx.runQuery(api.connections.get, {
      id: args.connectionId,
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Update status to syncing
    await ctx.runMutation(api.connections.updateSyncStatus, {
      id: args.connectionId,
      syncStatus: "syncing",
    });

    try {
      // Check if token needs refresh
      let accessToken = connection.accessToken;
      if (connection.tokenExpiry < Date.now()) {
        const refreshed = await ctx.runAction(api.google.oauth.refreshAccessToken, {
          refreshToken: connection.refreshToken,
        });
        accessToken = refreshed.accessToken;
        await ctx.runMutation(api.connections.updateTokens, {
          id: args.connectionId,
          accessToken: refreshed.accessToken,
          tokenExpiry: Date.now() + refreshed.expiresIn * 1000,
        });
      }

      // Get filtered domains
      const filteredDomains = await ctx.runQuery(internal.sync.getFilteredDomains, {
        connectionId: args.connectionId,
      });

      let pageToken: string | undefined;
      let processedCount = 0;
      let newAddressCount = 0;

      do {
        // List messages
        const { messages, nextPageToken } = await ctx.runAction(
          api.google.gmail.listMessages,
          {
            accessToken,
            labelId: connection.mailboxFolder,
            afterTimestamp: connection.lastSyncAt,
            pageToken,
          }
        );

        // Process each message
        for (const msg of messages) {
          // Check if already synced
          const alreadySynced = await ctx.runQuery(internal.sync.checkIfSynced, {
            connectionId: args.connectionId,
            messageId: msg.id,
          });

          if (alreadySynced) {
            continue;
          }

          // Get message details
          const details = await ctx.runAction(api.google.gmail.getMessage, {
            accessToken,
            messageId: msg.id,
          });

          // Parse email address
          const { email, name } = parseEmailAddress(details.from);

          // Check against filtered domains
          const domain = getDomainFromEmail(email);
          if (!filteredDomains.has(domain)) {
            // Upsert address
            await ctx.runMutation(api.addresses.upsert, {
              connectionId: args.connectionId,
              email,
              name,
              timestamp: details.timestamp,
            });
            newAddressCount++;
          }

          // Mark as synced
          await ctx.runMutation(internal.sync.markSynced, {
            connectionId: args.connectionId,
            messageId: msg.id,
          });

          processedCount++;
        }

        pageToken = nextPageToken;

        // Small delay to avoid rate limiting
        if (pageToken) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } while (pageToken);

      // Update status to idle
      await ctx.runMutation(api.connections.updateSyncStatus, {
        id: args.connectionId,
        syncStatus: "idle",
        lastSyncAt: Date.now(),
      });

      return { processedCount, newAddressCount };
    } catch (error) {
      // Update status to error
      await ctx.runMutation(api.connections.updateSyncStatus, {
        id: args.connectionId,
        syncStatus: "error",
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add email sync logic"
```

---

## Phase 6: Google Sheets Export

### Task 19: Create Sheets API Wrapper

**Files:**
- Create: `convex/google/sheets.ts`

**Step 1: Create sheets.ts**

Create file `convex/google/sheets.ts`:
```typescript
import { action } from "../_generated/server";
import { v } from "convex/values";

export const getSheetData = action({
  args: {
    accessToken: v.string(),
    spreadsheetId: v.string(),
    range: v.string(),
  },
  handler: async (ctx, args) => {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { values: [] };
      }
      const error = await response.text();
      throw new Error(`Sheets API error: ${error}`);
    }

    const data = await response.json();
    return { values: data.values || [] };
  },
});

export const appendRows = action({
  args: {
    accessToken: v.string(),
    spreadsheetId: v.string(),
    range: v.string(),
    values: v.array(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values/${encodeURIComponent(args.range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ values: args.values }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sheets API error: ${error}`);
    }

    return await response.json();
  },
});

export const updateRows = action({
  args: {
    accessToken: v.string(),
    spreadsheetId: v.string(),
    updates: v.array(
      v.object({
        range: v.string(),
        values: v.array(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: args.updates,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sheets API error: ${error}`);
    }

    return await response.json();
  },
});

export const listSpreadsheets = action({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)",
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drive API error: ${error}`);
    }

    const data = await response.json();
    return data.files as Array<{ id: string; name: string }>;
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add sheets api wrapper"
```

---

### Task 20: Create Sheets Export Logic

**Files:**
- Create: `convex/sheets.ts`

**Step 1: Create sheets.ts**

Create file `convex/sheets.ts`:
```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

export const exportToSheets = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    // Get connection details
    const connection = await ctx.runQuery(api.connections.get, {
      id: args.connectionId,
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Check if token needs refresh
    let accessToken = connection.accessToken;
    if (connection.tokenExpiry < Date.now()) {
      const refreshed = await ctx.runAction(api.google.oauth.refreshAccessToken, {
        refreshToken: connection.refreshToken,
      });
      accessToken = refreshed.accessToken;
      await ctx.runMutation(api.connections.updateTokens, {
        id: args.connectionId,
        accessToken: refreshed.accessToken,
        tokenExpiry: Date.now() + refreshed.expiresIn * 1000,
      });
    }

    // Get all addresses for this connection
    const allAddresses = await ctx.runQuery(api.addresses.list, {
      connectionId: args.connectionId,
    });

    if (allAddresses.length === 0) {
      return { updatedCount: 0, appendedCount: 0 };
    }

    // Get existing sheet data
    const range = `${connection.sheetTab}!A:D`;
    const existing = await ctx.runAction(api.google.sheets.getSheetData, {
      accessToken,
      spreadsheetId: connection.sheetsId,
      range,
    });

    // Build lookup: email -> row number (1-indexed, row 1 is header)
    const emailToRow = new Map<string, number>();
    const existingValues = existing.values || [];

    // Skip header row if exists
    const startRow = existingValues.length > 0 && existingValues[0][0] === "Email" ? 1 : 0;

    for (let i = startRow; i < existingValues.length; i++) {
      const row = existingValues[i];
      if (row[0]) {
        emailToRow.set(row[0].toLowerCase(), i + 1); // 1-indexed for Sheets
      }
    }

    // Separate addresses into updates vs appends
    const updates: Array<{ range: string; values: string[][] }> = [];
    const appends: string[][] = [];
    const addressesToMark: string[] = [];

    for (const addr of allAddresses) {
      // Only process if there are changes to export
      if (addr.emailCount <= addr.lastExportedCount) {
        continue;
      }

      const rowData = [
        addr.email,
        addr.name,
        formatDate(addr.firstContactAt),
        addr.emailCount.toString(),
      ];

      const existingRow = emailToRow.get(addr.email.toLowerCase());

      if (existingRow) {
        // Update existing row
        updates.push({
          range: `${connection.sheetTab}!A${existingRow}:D${existingRow}`,
          values: [rowData],
        });
      } else {
        // Append new row
        appends.push(rowData);
      }

      addressesToMark.push(addr._id);
    }

    // Add header if sheet is empty
    if (existingValues.length === 0 && appends.length > 0) {
      appends.unshift(["Email", "Name", "First Contact", "Email Count"]);
    }

    // Perform updates
    if (updates.length > 0) {
      await ctx.runAction(api.google.sheets.updateRows, {
        accessToken,
        spreadsheetId: connection.sheetsId,
        updates,
      });
    }

    // Perform appends
    if (appends.length > 0) {
      await ctx.runAction(api.google.sheets.appendRows, {
        accessToken,
        spreadsheetId: connection.sheetsId,
        range: `${connection.sheetTab}!A:D`,
        values: appends,
      });
    }

    // Mark addresses as exported
    if (addressesToMark.length > 0) {
      await ctx.runMutation(api.addresses.markExported, {
        ids: addressesToMark,
      });
    }

    return {
      updatedCount: updates.length,
      appendedCount: appends.length - (existingValues.length === 0 ? 1 : 0), // Subtract header
    };
  },
});
```

**Step 2: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: add sheets export logic"
```

---

## Phase 7: Scheduled Jobs

### Task 21: Create Cron Jobs

**Files:**
- Create: `convex/crons.ts`

**Step 1: Create crons.ts**

Create file `convex/crons.ts`:
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run sync scheduler every 15 minutes
crons.interval(
  "sync-scheduler",
  { minutes: 15 },
  internal.scheduler.runDueSyncs
);

export default crons;
```

**Step 2: Create scheduler.ts**

Create file `convex/scheduler.ts`:
```typescript
import { internalAction, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

const SCHEDULE_INTERVALS: Record<string, number> = {
  "15min": 15 * 60 * 1000,
  "1hour": 60 * 60 * 1000,
  "4hours": 4 * 60 * 60 * 1000,
  "daily": 24 * 60 * 60 * 1000,
  manual: Infinity,
};

export const getDueConnections = internalQuery({
  handler: async (ctx) => {
    const connections = await ctx.db.query("connections").collect();
    const now = Date.now();

    return connections.filter((conn) => {
      if (!conn.isActive) return false;
      if (conn.syncStatus === "syncing") return false;
      if (conn.syncSchedule === "manual") return false;

      const interval = SCHEDULE_INTERVALS[conn.syncSchedule] || Infinity;
      const lastSync = conn.lastSyncAt || 0;

      return now - lastSync >= interval;
    });
  },
});

export const runDueSyncs = internalAction({
  handler: async (ctx) => {
    const dueConnections = await ctx.runQuery(internal.scheduler.getDueConnections);

    for (const conn of dueConnections) {
      try {
        // Run sync
        await ctx.runAction(api.sync.syncConnection, {
          connectionId: conn._id,
        });

        // Run export
        await ctx.runAction(api.sheets.exportToSheets, {
          connectionId: conn._id,
        });
      } catch (error) {
        console.error(`Sync failed for connection ${conn._id}:`, error);
      }
    }
  },
});
```

**Step 3: Push to Convex**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: add scheduled sync jobs"
```

---

## Phase 8: Frontend UI

### Task 22: Create Layout Component

**Files:**
- Create: `src/components/Layout.tsx`

**Step 1: Create components directory**

Run:
```bash
mkdir -p /Users/mjhorswood/sites/GWS-Extractor/src/components
```

**Step 2: Create Layout.tsx**

Create file `src/components/Layout.tsx`:
```typescript
import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>GWS Email Extractor</h1>
        <div className="header-right">
          <span>{auth?.email}</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>
      <main className="main">{children}</main>
    </div>
  );
}
```

**Step 3: Add layout styles to index.css**

Append to `src/index.css`:
```css

.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: white;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  font-size: 1.25rem;
  color: #333;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-right span {
  color: #666;
}

.logout-button {
  background: transparent;
  border: 1px solid #ddd;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.logout-button:hover {
  background: #f5f5f5;
}

.main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
```

**Step 4: Commit**

Run:
```bash
git add . && git commit -m "feat: create layout component"
```

---

### Task 23: Create Connection Card Component

**Files:**
- Create: `src/components/ConnectionCard.tsx`

**Step 1: Create ConnectionCard.tsx**

Create file `src/components/ConnectionCard.tsx`:
```typescript
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";

interface ConnectionCardProps {
  connection: Doc<"connections">;
  addressCount: number;
  onEdit: () => void;
}

export default function ConnectionCard({
  connection,
  addressCount,
  onEdit,
}: ConnectionCardProps) {
  const syncConnection = useAction(api.sync.syncConnection);
  const exportToSheets = useAction(api.sheets.exportToSheets);

  const handleSync = async () => {
    try {
      await syncConnection({ connectionId: connection._id });
      await exportToSheets({ connectionId: connection._id });
    } catch (error) {
      console.error("Sync failed:", error);
      alert("Sync failed. Check console for details.");
    }
  };

  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Less than an hour ago";
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  };

  const getStatusColor = () => {
    switch (connection.syncStatus) {
      case "syncing":
        return "#f0ad4e";
      case "error":
        return "#d9534f";
      default:
        return connection.isActive ? "#5cb85c" : "#999";
    }
  };

  return (
    <div className="connection-card">
      <div className="connection-header">
        <h3>{connection.name}</h3>
        <button onClick={onEdit} className="edit-button">
          Settings
        </button>
      </div>
      <div className="connection-stats">
        <span>{addressCount} addresses</span>
        <span style={{ color: getStatusColor() }}>
          {connection.syncStatus === "syncing"
            ? "Syncing..."
            : connection.isActive
              ? "Active"
              : "Paused"}
        </span>
        <span>Syncs {connection.syncSchedule}</span>
      </div>
      <div className="connection-footer">
        <span>Last sync: {formatLastSync(connection.lastSyncAt)}</span>
        <button
          onClick={handleSync}
          disabled={connection.syncStatus === "syncing"}
          className="sync-button"
        >
          {connection.syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      </div>
      {connection.lastError && (
        <div className="connection-error">Error: {connection.lastError}</div>
      )}
    </div>
  );
}
```

**Step 2: Add connection card styles**

Append to `src/index.css`:
```css

.connection-card {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

.connection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.connection-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.edit-button {
  background: transparent;
  border: 1px solid #ddd;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.edit-button:hover {
  background: #f5f5f5;
}

.connection-stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1rem;
  color: #666;
}

.connection-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.connection-footer span {
  color: #999;
  font-size: 0.875rem;
}

.sync-button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.sync-button:hover:not(:disabled) {
  background: #3367d6;
}

.sync-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.connection-error {
  margin-top: 1rem;
  padding: 0.5rem;
  background: #fee;
  color: #c00;
  border-radius: 4px;
  font-size: 0.875rem;
}
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: create connection card component"
```

---

### Task 24: Create Dashboard Page

**Files:**
- Create: `src/pages/Dashboard.tsx`

**Step 1: Create Dashboard.tsx**

Create file `src/pages/Dashboard.tsx`:
```typescript
import { useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/AuthContext";
import Layout from "../components/Layout";
import ConnectionCard from "../components/ConnectionCard";

export default function Dashboard() {
  const { auth } = useAuth();
  const navigate = useNavigate();

  const connections = useQuery(
    api.connections.list,
    auth?.userId ? { userId: auth.userId as any } : "skip"
  );

  const handleAddConnection = () => {
    navigate("/connections/new");
  };

  const handleEditConnection = (connectionId: string) => {
    navigate(`/connections/${connectionId}`);
  };

  return (
    <Layout>
      <div className="dashboard">
        <div className="dashboard-header">
          <h2>Your Connections</h2>
          <button onClick={handleAddConnection} className="add-button">
            + Add Connection
          </button>
        </div>

        {connections === undefined && <p>Loading...</p>}

        {connections && connections.length === 0 && (
          <div className="empty-state">
            <p>No connections yet.</p>
            <p>Add a connection to start extracting email addresses.</p>
          </div>
        )}

        {connections &&
          connections.map((conn) => (
            <ConnectionCardWithCount
              key={conn._id}
              connection={conn}
              onEdit={() => handleEditConnection(conn._id)}
            />
          ))}
      </div>
    </Layout>
  );
}

function ConnectionCardWithCount({
  connection,
  onEdit,
}: {
  connection: any;
  onEdit: () => void;
}) {
  const count = useQuery(api.addresses.count, {
    connectionId: connection._id,
  });

  return (
    <ConnectionCard
      connection={connection}
      addressCount={count ?? 0}
      onEdit={onEdit}
    />
  );
}
```

**Step 2: Add dashboard styles**

Append to `src/index.css`:
```css

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.dashboard-header h2 {
  margin: 0;
}

.add-button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.add-button:hover {
  background: #3367d6;
}

.empty-state {
  text-align: center;
  padding: 3rem;
  background: white;
  border-radius: 8px;
  color: #666;
}
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: create dashboard page"
```

---

### Task 25: Create Connection Settings Page

**Files:**
- Create: `src/pages/ConnectionSettings.tsx`

**Step 1: Create ConnectionSettings.tsx**

Create file `src/pages/ConnectionSettings.tsx`:
```typescript
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../lib/AuthContext";
import Layout from "../components/Layout";

const SCHEDULE_OPTIONS = [
  { value: "15min", label: "Every 15 minutes" },
  { value: "1hour", label: "Every hour" },
  { value: "4hours", label: "Every 4 hours" },
  { value: "daily", label: "Daily" },
  { value: "manual", label: "Manual only" },
];

export default function ConnectionSettings() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { auth } = useAuth();

  const connection = useQuery(
    api.connections.get,
    !isNew && id ? { id: id as any } : "skip"
  );

  const createConnection = useMutation(api.connections.create);
  const updateConnection = useMutation(api.connections.update);
  const deleteConnection = useMutation(api.connections.remove);
  const listLabels = useAction(api.google.gmail.listLabels);
  const listSpreadsheets = useAction(api.google.sheets.listSpreadsheets);

  const [name, setName] = useState("");
  const [mailboxFolder, setMailboxFolder] = useState("INBOX");
  const [sheetsId, setSheetsId] = useState("");
  const [sheetTab, setSheetTab] = useState("Addresses");
  const [syncSchedule, setSyncSchedule] = useState("1hour");
  const [isActive, setIsActive] = useState(true);
  const [labels, setLabels] = useState<Array<{ id: string; name: string }>>([]);
  const [spreadsheets, setSpreadsheets] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setMailboxFolder(connection.mailboxFolder);
      setSheetsId(connection.sheetsId);
      setSheetTab(connection.sheetTab);
      setSyncSchedule(connection.syncSchedule);
      setIsActive(connection.isActive);
    }
  }, [connection]);

  useEffect(() => {
    const loadOptions = async () => {
      if (!auth?.accessToken) return;

      try {
        const [labelsResult, spreadsheetsResult] = await Promise.all([
          listLabels({ accessToken: auth.accessToken }),
          listSpreadsheets({ accessToken: auth.accessToken }),
        ]);
        setLabels(labelsResult);
        setSpreadsheets(spreadsheetsResult);
      } catch (error) {
        console.error("Failed to load options:", error);
      }
    };

    loadOptions();
  }, [auth?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isNew) {
        await createConnection({
          userId: auth!.userId as any,
          name,
          accessToken: auth!.accessToken!,
          refreshToken: auth!.refreshToken!,
          tokenExpiry: auth!.tokenExpiry!,
          mailboxFolder,
          sheetsId,
          sheetTab,
          syncSchedule,
        });
      } else {
        await updateConnection({
          id: id as any,
          name,
          mailboxFolder,
          sheetsId,
          sheetTab,
          syncSchedule,
          isActive,
        });
      }
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Failed to save connection");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this connection?")) return;

    try {
      await deleteConnection({ id: id as any });
      navigate("/dashboard");
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete connection");
    }
  };

  return (
    <Layout>
      <div className="settings-page">
        <h2>{isNew ? "Add Connection" : "Edit Connection"}</h2>

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sales Inbox"
              required
            />
          </div>

          <div className="form-group">
            <label>Gmail Folder</label>
            <select
              value={mailboxFolder}
              onChange={(e) => setMailboxFolder(e.target.value)}
            >
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
              {labels.length === 0 && <option value="INBOX">INBOX</option>}
            </select>
          </div>

          <div className="form-group">
            <label>Google Sheet</label>
            <select
              value={sheetsId}
              onChange={(e) => setSheetsId(e.target.value)}
              required
            >
              <option value="">Select a spreadsheet...</option>
              {spreadsheets.map((sheet) => (
                <option key={sheet.id} value={sheet.id}>
                  {sheet.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Sheet Tab Name</label>
            <input
              type="text"
              value={sheetTab}
              onChange={(e) => setSheetTab(e.target.value)}
              placeholder="e.g., Addresses"
              required
            />
          </div>

          <div className="form-group">
            <label>Sync Schedule</label>
            <select
              value={syncSchedule}
              onChange={(e) => setSyncSchedule(e.target.value)}
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {!isNew && (
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" disabled={loading} className="save-button">
              {loading ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="cancel-button"
            >
              Cancel
            </button>
            {!isNew && (
              <button
                type="button"
                onClick={handleDelete}
                className="delete-button"
              >
                Delete
              </button>
            )}
          </div>
        </form>

        {!isNew && (
          <div className="domain-filters-link">
            <button
              onClick={() => navigate(`/connections/${id}/domains`)}
              className="link-button"
            >
              Manage Domain Filters →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
```

**Step 2: Add settings styles**

Append to `src/index.css`:
```css

.settings-page {
  max-width: 600px;
}

.settings-page h2 {
  margin-bottom: 1.5rem;
}

.settings-form {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.form-group.checkbox label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: normal;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #eee;
}

.save-button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
}

.save-button:hover:not(:disabled) {
  background: #3367d6;
}

.cancel-button {
  background: transparent;
  border: 1px solid #ddd;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
}

.delete-button {
  background: #d9534f;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: auto;
}

.delete-button:hover {
  background: #c9302c;
}

.domain-filters-link {
  margin-top: 1.5rem;
}

.link-button {
  background: transparent;
  border: none;
  color: #4285f4;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
}

.link-button:hover {
  text-decoration: underline;
}
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: create connection settings page"
```

---

### Task 26: Create Domain Filters Page

**Files:**
- Create: `src/pages/DomainFilters.tsx`

**Step 1: Create DomainFilters.tsx**

Create file `src/pages/DomainFilters.tsx`:
```typescript
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Layout from "../components/Layout";

export default function DomainFilters() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const domains = useQuery(api.domains.list, { connectionId: id as any });
  const addDomain = useMutation(api.domains.add);
  const addBulkDomains = useMutation(api.domains.addBulk);
  const removeDomain = useMutation(api.domains.remove);

  const [newDomain, setNewDomain] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;

    try {
      await addDomain({
        connectionId: id as any,
        domain: newDomain.trim(),
      });
      setNewDomain("");
    } catch (error) {
      console.error("Failed to add domain:", error);
    }
  };

  const handleBulkImport = async () => {
    const domains = bulkInput
      .split(/[\n,]/)
      .map((d) => d.trim())
      .filter(Boolean);

    if (domains.length === 0) return;

    try {
      await addBulkDomains({
        connectionId: id as any,
        domains,
      });
      setBulkInput("");
      setShowBulk(false);
    } catch (error) {
      console.error("Failed to import domains:", error);
    }
  };

  const handleRemove = async (domainId: string) => {
    try {
      await removeDomain({ id: domainId as any });
    } catch (error) {
      console.error("Failed to remove domain:", error);
    }
  };

  return (
    <Layout>
      <div className="domains-page">
        <div className="domains-header">
          <h2>Domain Filters</h2>
          <button
            onClick={() => navigate(`/connections/${id}`)}
            className="back-button"
          >
            ← Back to Settings
          </button>
        </div>

        <p className="domains-description">
          Email addresses from these domains will be excluded from extraction.
        </p>

        <div className="domains-card">
          <form onSubmit={handleAddDomain} className="add-domain-form">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Enter domain (e.g., mycompany.com)"
            />
            <button type="submit">Add</button>
          </form>

          <button
            onClick={() => setShowBulk(!showBulk)}
            className="bulk-toggle"
          >
            {showBulk ? "Hide Bulk Import" : "Bulk Import"}
          </button>

          {showBulk && (
            <div className="bulk-import">
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                placeholder="Enter domains, one per line or comma-separated"
                rows={5}
              />
              <button onClick={handleBulkImport}>Import All</button>
            </div>
          )}

          <div className="domains-list">
            {domains === undefined && <p>Loading...</p>}
            {domains && domains.length === 0 && (
              <p className="no-domains">No filtered domains yet.</p>
            )}
            {domains &&
              domains.map((domain) => (
                <div key={domain._id} className="domain-item">
                  <span>{domain.domain}</span>
                  <button
                    onClick={() => handleRemove(domain._id)}
                    className="remove-button"
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
```

**Step 2: Add domain filter styles**

Append to `src/index.css`:
```css

.domains-page {
  max-width: 600px;
}

.domains-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.back-button {
  background: transparent;
  border: none;
  color: #4285f4;
  cursor: pointer;
  font-size: 0.875rem;
}

.domains-description {
  color: #666;
  margin-bottom: 1.5rem;
}

.domains-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.add-domain-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.add-domain-form input {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.add-domain-form button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
}

.bulk-toggle {
  background: transparent;
  border: none;
  color: #4285f4;
  cursor: pointer;
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.bulk-import {
  margin-bottom: 1rem;
}

.bulk-import textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  font-family: inherit;
}

.bulk-import button {
  background: #4285f4;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.domains-list {
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.no-domains {
  color: #999;
  text-align: center;
  padding: 1rem;
}

.domain-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
}

.domain-item:last-child {
  border-bottom: none;
}

.remove-button {
  background: transparent;
  border: none;
  color: #999;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0 0.5rem;
}

.remove-button:hover {
  color: #d9534f;
}
```

**Step 3: Commit**

Run:
```bash
git add . && git commit -m "feat: create domain filters page"
```

---

### Task 27: Update App Routes

**Files:**
- Modify: `src/App.tsx`

**Step 1: Update App.tsx with all routes**

Replace `src/App.tsx`:
```typescript
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
```

**Step 2: Commit**

Run:
```bash
git add . && git commit -m "feat: add all application routes"
```

---

## Phase 9: Docker Setup

### Task 28: Create Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Create Dockerfile**

Create file `Dockerfile`:
```dockerfile
# Build stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Step 2: Create nginx.conf**

Create file `nginx.conf`:
```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Step 3: Create docker-compose.yml**

Create file `docker-compose.yml`:
```yaml
version: "3.8"

services:
  app:
    build: .
    ports:
      - "3000:80"
    environment:
      - VITE_CONVEX_URL=${VITE_CONVEX_URL}
      - VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
    restart: unless-stopped
```

**Step 4: Update package.json with build script**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

**Step 5: Commit**

Run:
```bash
git add . && git commit -m "feat: add docker configuration"
```

---

## Phase 10: Final Setup

### Task 29: Create README

**Files:**
- Create: `README.md`

**Step 1: Create README.md**

Create file `README.md`:
```markdown
# GWS Email Address Extractor

Extract email addresses from Gmail and export to Google Sheets.

## Setup

### 1. Google Cloud Console

1. Create a new project at https://console.cloud.google.com
2. Enable APIs: Gmail API, Google Sheets API, Google Drive API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI: `http://localhost:3000/auth/callback`

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
VITE_GOOGLE_CLIENT_ID=your-client-id
```

### 3. Convex Setup

```bash
npx convex dev
```

This will create your Convex deployment and populate the Convex URL.

### 4. Set Convex Environment Variables

```bash
npx convex env set GOOGLE_CLIENT_ID your-client-id
npx convex env set GOOGLE_CLIENT_SECRET your-client-secret
```

### 5. Run Development Server

```bash
npm run dev
```

### 6. Docker Deployment

```bash
docker-compose up -d
```

## Usage

1. Sign in with Google
2. Add a connection (configure Gmail folder and Google Sheet)
3. Set up domain filters to exclude internal addresses
4. Configure sync schedule or trigger manual sync
5. View extracted addresses in your Google Sheet
```

**Step 2: Commit**

Run:
```bash
git add . && git commit -m "docs: add readme"
```

---

### Task 30: Final Verification

**Step 1: Verify project structure**

Run:
```bash
ls -la /Users/mjhorswood/sites/GWS-Extractor/
ls -la /Users/mjhorswood/sites/GWS-Extractor/src/
ls -la /Users/mjhorswood/sites/GWS-Extractor/convex/
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx tsc --noEmit
```

**Step 3: Verify Convex schema**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npx convex dev --once
```

**Step 4: Test development server starts**

Run:
```bash
cd /Users/mjhorswood/sites/GWS-Extractor && npm run dev
```

Expected: Server starts on http://localhost:3000

---

## Summary

This implementation plan covers:

1. **Phase 1-3**: Project setup, database schema, user authentication
2. **Phase 4**: Connection and domain filter management
3. **Phase 5-6**: Gmail sync and Sheets export
4. **Phase 7**: Scheduled jobs
5. **Phase 8**: Complete frontend UI
6. **Phase 9-10**: Docker deployment and documentation

Total: 30 tasks with incremental commits.
