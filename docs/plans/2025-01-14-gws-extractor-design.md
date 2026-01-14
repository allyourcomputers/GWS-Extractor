# GWS Email Address Extractor - Design Document

## Overview

Application to extract email addresses from a Google Workspace mailbox and export them to Google Sheets for lead generation purposes.

## Requirements

| Aspect | Decision |
|--------|----------|
| Purpose | Lead generation - collecting sender addresses |
| Extract | From addresses (senders only) |
| Data captured | Email, name, first contact date, email count |
| Domain filters | Many (5+), web-managed per connection |
| Frontend | React |
| Sync schedule | Configurable via UI |
| Sheets output | Append new + update existing rows |
| Multi-account | Yes, separate configs per Google account |
| Auth | Google Sign-In, per-account isolation |
| Hosting | Docker frontend + Convex cloud backend |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Docker Container                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    React Frontend                        │    │
│  │  • Google Sign-In (user auth)                           │    │
│  │  • Dashboard per account                                │    │
│  │  • Configuration management                             │    │
│  │  • Manual sync trigger                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Convex Cloud                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Database   │  │   Actions    │  │  Scheduled   │          │
│  │   Tables     │  │  (API calls) │  │    Jobs      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Google APIs                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  OAuth 2.0   │  │  Gmail API   │  │  Sheets API  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### Table: `users`
Authenticated users from Google Sign-In.

| Field | Type | Description |
|-------|------|-------------|
| `googleId` | string | Google user ID (unique) |
| `email` | string | User's Google email |
| `name` | string | Display name |

### Table: `connections`
Google Workspace account configurations.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | id (users) | Owner of this connection |
| `name` | string | Friendly name (e.g., "Sales Inbox") |
| `accessToken` | string | OAuth access token (encrypted) |
| `refreshToken` | string | OAuth refresh token (encrypted) |
| `tokenExpiry` | number | Token expiration timestamp |
| `mailboxFolder` | string | Gmail label/folder to sync |
| `sheetsId` | string | Target Google Sheet ID |
| `sheetTab` | string | Tab name within the sheet |
| `syncSchedule` | string | Interval identifier |
| `isActive` | boolean | Enable/disable sync |
| `lastSyncAt` | number | Last successful sync timestamp |
| `syncStatus` | string | "idle" / "syncing" / "error" |
| `lastError` | string | Error message if failed |

### Table: `filteredDomains`
Internal domains to exclude (per connection).

| Field | Type | Description |
|-------|------|-------------|
| `connectionId` | id (connections) | Parent connection |
| `domain` | string | Domain to filter (e.g., "mycompany.com") |

### Table: `syncedEmails`
Track which emails have been processed.

| Field | Type | Description |
|-------|------|-------------|
| `connectionId` | id (connections) | Parent connection |
| `messageId` | string | Gmail message ID |
| `syncedAt` | number | When it was processed |

### Table: `addresses`
Extracted email addresses.

| Field | Type | Description |
|-------|------|-------------|
| `connectionId` | id (connections) | Parent connection |
| `email` | string | Email address |
| `name` | string | Sender display name |
| `firstContactAt` | number | First email timestamp |
| `emailCount` | number | Total emails from this sender |
| `lastExportedCount` | number | Email count at last export |

## Google OAuth 2.0 Flow

### Setup Requirements
1. Create a Google Cloud Project
2. Enable Gmail API and Google Sheets API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials (Web application type)
5. Set authorized redirect URI

### Required Scopes
- `gmail.readonly`
- `spreadsheets`
- `userinfo.email`
- `userinfo.profile`

### Token Management
- Store encrypted tokens in `connections` table
- Check `tokenExpiry` before each API call
- Use `refreshToken` to obtain new `accessToken` when expired
- Client ID/Secret stored as Convex environment variables

## Email Sync Process

1. **Refresh OAuth token** if needed
2. **Query Gmail API** for messages in configured folder since last sync
3. **Handle pagination** via nextPageToken
4. **For each message**: fetch details, extract From header, parse email + name
5. **Record in `syncedEmails`** to prevent reprocessing
6. **For each address**: check against filtered domains, upsert into `addresses`
7. **Update `lastSyncAt`** on connection

### Rate Limiting
- Gmail API: 250 quota units/second per user
- Batch requests where possible
- Add delays between pages for high volume

### Error Handling
- Token errors: attempt refresh, mark connection inactive if fails
- API errors: log, retry with backoff, surface in UI

## Google Sheets Export

### Trigger Points
- Automatically after each sync
- Manual "Export Now" button

### Export Logic
1. Query all addresses for connection
2. Fetch existing sheet data
3. Build lookup: email → row number
4. For each address:
   - Exists in sheet? → UPDATE row
   - Not in sheet? → APPEND row
5. Batch API calls for efficiency
6. Update `lastExportedCount` for each address

### Sheet Structure
| Email | Name | First Contact | Email Count |
|-------|------|---------------|-------------|

## Scheduled Jobs

### Schedule Options
| Option | Interval |
|--------|----------|
| Every 15 minutes | High activity |
| Every hour | Active monitoring |
| Every 4 hours | Regular check-ins |
| Daily | Low volume |
| Manual only | On-demand |

### Implementation
- Master cron job runs every 15 minutes
- Checks which connections are due based on `syncSchedule`
- Triggers sync for due connections
- Prevents overlaps via `syncStatus` check

## Web Interface

### Pages
1. **Login** - Google Sign-In
2. **Dashboard** - List of connections with status, sync controls
3. **Connection Settings** - Configure folder, sheet, schedule
4. **Domain Filters** - Manage excluded domains with bulk import

### Key Features
- Real-time sync status via Convex subscriptions
- Visual feedback during operations
- Easy domain management
- Quick access to linked Google Sheet

## Project Structure

```
GWS-Extractor/
├── convex/
│   ├── schema.ts              # Database schema
│   ├── auth.ts                # User authentication
│   ├── connections.ts         # Connection CRUD
│   ├── addresses.ts           # Address management
│   ├── domains.ts             # Domain filter management
│   ├── sync.ts                # Email sync logic
│   ├── sheets.ts              # Google Sheets export
│   ├── google/
│   │   ├── oauth.ts           # OAuth token management
│   │   ├── gmail.ts           # Gmail API wrapper
│   │   └── sheets.ts          # Sheets API wrapper
│   └── crons.ts               # Scheduled jobs
│
├── src/
│   ├── App.tsx                # Main app with routing
│   ├── main.tsx               # Entry point
│   ├── components/
│   │   ├── Layout.tsx
│   │   ├── ConnectionCard.tsx
│   │   ├── SyncButton.tsx
│   │   └── DomainList.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── ConnectionSettings.tsx
│   │   └── DomainFilters.tsx
│   └── lib/
│       └── google.ts          # Frontend OAuth helpers
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── vite.config.ts
└── .env.example
```

## Environment Variables

```
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
CONVEX_DEPLOYMENT=xxx
VITE_CONVEX_URL=xxx
```
