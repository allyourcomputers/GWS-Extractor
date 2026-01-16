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
| `syncStatus` | string | "idle" / "syncing" / "error" / "deleting" / "resetting" |
| `lastError` | string | Error message if failed |
| `totalMessagesToSync` | number? | Total messages in folder for progress tracking |
| `messagesProcessed` | number? | Number of messages processed so far |
| `syncPageToken` | string? | Gmail API pagination token for resuming |
| `syncStartedAt` | number? | Timestamp when current sync started |

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
- `gmail.readonly` - Read emails from Gmail
- `spreadsheets` - Create and update Google Sheets
- `drive.readonly` - List available spreadsheets
- `userinfo.email` - Get user email address
- `userinfo.profile` - Get user display name

### Token Management
- Store encrypted tokens in `connections` table
- Check `tokenExpiry` before each API call
- Use `refreshToken` to obtain new `accessToken` when expired
- Client ID/Secret stored as Convex environment variables

## Email Sync Process

### Starting a Sync
1. **Check sync status** - abort if already syncing, deleting, or resetting
2. **Refresh OAuth token** if needed
3. **Get folder info** - total message count for progress tracking
4. **Set status to "syncing"** with total count and start timestamp
5. **Schedule first batch** via Convex scheduler

### Batch Processing (200 messages per batch)
1. **Re-check status** - abort if no longer "syncing" (handles cancellation/deletion)
2. **Refresh OAuth token** if needed
3. **List messages** using page token for pagination
4. **Check which messages already synced** via `syncedEmails` table
5. **For each unsynced message**: fetch details, extract From header, parse email + name
6. **Record in `syncedEmails`** to prevent reprocessing
7. **For each address**: check against filtered domains, upsert into `addresses`
8. **Re-check status before updating** - prevents race condition with delete
9. **Update progress** and schedule next batch (500ms delay)
10. **When complete**: set status to "idle", update `lastSyncAt`

### Rate Limiting
- Gmail API: 250 quota units/second per user
- 500ms delay between batches to avoid rate limits
- Batch size: 200 messages per batch

### Error Handling
- Token errors: attempt refresh, mark connection inactive if fails
- API errors: log, set status to "error" (only if still syncing)
- Race condition protection: re-check status before any state updates

### Stuck Detection
- UI shows warning if syncing for 2+ minutes with no progress
- User can click "Reset" to clear stuck status

## Connection Deletion

### Batch Deletion Process
Large connections require batch deletion to avoid database limits (max 4096 reads per mutation):

1. **Set status to "deleting"** - blocks new syncs and shows UI indicator
2. **Delete filtered domains** (batch of 500)
3. **Delete synced emails** (batch of 500) - largest table, may take multiple batches
4. **Delete addresses** (batch of 500)
5. **Delete connection** record

Each batch schedules the next batch with 100ms delay. The scheduler cron job ignores connections with "deleting" status.

### Reset Functionality

**Simple Reset** (`resetSync`):
- Clears sync status to "idle"
- Preserves synced data (count from `syncedEmails` table)
- Use when sync is stuck

**Full Reset** (`fullReset`):
- Sets status to "resetting"
- Deletes all synced emails in batches
- Clears progress counters
- Use to start fresh

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
- Skips connections that are:
  - Already syncing (`syncStatus === "syncing"`)
  - Being deleted (`syncStatus === "deleting"`)
  - Being reset (`syncStatus === "resetting"`)
  - Inactive (`isActive === false`)
  - Manual-only (`syncSchedule === "manual"`)

## Web Interface

### Pages
1. **Login** - Google Sign-In
2. **Dashboard** - List of connections with status, sync controls
3. **Connection Settings** - Configure folder, sheet, schedule
4. **Domain Filters** - Manage excluded domains with bulk import

### Key Features
- Real-time sync status via Convex subscriptions
- Visual feedback during operations (progress bar, percentage, time remaining)
- Estimated time remaining calculated from actual processing rate
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
│   ├── scheduler.ts           # Scheduled sync logic
│   └── crons.ts               # Cron job definitions
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
