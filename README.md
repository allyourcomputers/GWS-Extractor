# GWS Email Address Extractor

Extract email addresses from Gmail and export to Google Sheets. Perfect for building contact lists from your inbox.

## Features

- **Gmail Integration**: Connect to any Gmail folder/label to extract sender addresses
- **Google Sheets Export**: Export addresses to Google Sheets (append new, update existing)
- **Create Spreadsheets**: Create new Google Spreadsheets directly from the app
- **Domain Filtering**: Exclude internal domains (e.g., your company's domain) from extraction
- **Multi-Account Support**: Set up multiple connections with different configurations
- **Scheduled Sync**: Configure automatic syncing (every 15 min, hourly, 4 hours, daily, or manual only)
- **Background Processing**: Large mailboxes are processed in batches automatically (200 messages per batch)
- **Real-time Progress**: See sync progress with live updates (X/Y messages, percentage complete)
- **Time Estimates**: Shows estimated time remaining based on actual processing speed
- **Cancellable Syncs**: Cancel long-running syncs at any time
- **Reset Functionality**: Reset stuck syncs or perform full reset to start fresh
- **Stuck Detection**: Automatically detects and alerts when sync appears stuck (no progress for 2+ minutes)

## Setup

### 1. Google Cloud Console

1. Create a new project at https://console.cloud.google.com
2. Enable APIs:
   - Gmail API
   - Google Sheets API
   - Google Drive API
3. Configure OAuth consent screen:
   - Add scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/spreadsheets`
     - `https://www.googleapis.com/auth/drive.readonly`
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - Development: `http://localhost:5173/auth/callback`
   - Production: `https://your-domain.com/auth/callback`

### 2. Environment Variables

Create `.env.local` with:

```
CONVEX_DEPLOYMENT=your-convex-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_GOOGLE_CLIENT_ID=your-client-id
```

### 3. Convex Setup

```bash
npm install
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

The app will be available at http://localhost:5173

## Production Deployment

### Important: Two-Part Deployment

This app has two parts that must be deployed:
1. **Convex Backend** - Serverless functions deployed to Convex cloud
2. **Frontend** - React app served via Docker/nginx

**You must deploy Convex functions before the app will work!**

### Quick Deploy (Recommended)

Use the deploy script to handle everything:

```bash
./deploy.sh
```

This will:
1. Install dependencies
2. Deploy Convex functions to the cloud
3. Build the frontend

### Manual Deployment

#### Step 1: Deploy Convex Functions

```bash
npm install
npx convex deploy
```

You'll need to authenticate with Convex the first time:
```bash
npx convex login
```

#### Step 2: Build and Run Docker

```bash
docker-compose up -d --build
```

The app will be available at http://localhost:3300

### Automated Deployment with Deploy Key

For CI/CD pipelines, use a Convex deploy key instead of interactive login:

1. Go to your Convex dashboard: https://dashboard.convex.dev
2. Select your project > Settings > Deploy Keys
3. Generate a new deploy key
4. Set it as an environment variable:

```bash
export CONVEX_DEPLOY_KEY=your-deploy-key
npx convex deploy
```

### Environment Variables for Docker

The following environment variables must be set (via `.env` file or docker-compose):

- `VITE_CONVEX_URL` - Your Convex deployment URL
- `VITE_GOOGLE_CLIENT_ID` - Your Google OAuth client ID

## Usage

### Adding a Connection

1. Sign in with Google
2. Click "Add Connection" on the dashboard
3. Enter a name for the connection (e.g., "Sales Inbox")
4. Select the Gmail folder to extract from (all labels are loaded automatically)
5. Select an existing Google Sheet or click "+ Create new spreadsheet" to create one
6. Enter the sheet tab name (defaults to "Addresses")
7. Choose a sync schedule
8. Click Save

### Managing Domain Filters

1. Open an existing connection
2. Click "Manage Domain Filters"
3. Add domains to exclude (e.g., `yourcompany.com`)
4. Use bulk import to add multiple domains at once

### Syncing Emails

#### How Sync Works

When you click **"Sync Now"**:

1. The app gets the total email count from your Gmail folder
2. Emails are processed in **batches of 200** to avoid timeouts
3. Each batch runs automatically with a 500ms delay between batches
4. A **progress bar** shows real-time progress (e.g., "12,345 / 49,612 messages - 25%")
5. **Estimated time remaining** is calculated based on actual processing speed (e.g., "~2h 15m remaining")
6. Processing continues in the background until all emails are done
7. If no progress is made for 2+ minutes, a "stuck" warning appears

#### Sync Controls

- **Sync Now**: Start syncing emails from Gmail
- **Cancel**: Stop an ongoing sync at any point (progress is saved)
- **Reset**: Clear stuck sync status (preserves already-synced data)
- **Export**: Manually export collected addresses to Google Sheets

#### Connection Status

Connections can have the following statuses:
- **Active**: Connection is configured and ready
- **Syncing**: Actively syncing emails from Gmail
- **Deleting**: Connection is being deleted (happens in batches for large datasets)
- **Resetting**: Full reset in progress (clearing all synced data)
- **Error**: Last sync failed - check error message for details

#### Scheduled Sync

Connections can be configured to sync automatically:
- Every 15 minutes
- Every hour
- Every 4 hours
- Daily
- Manual only

### Exporting to Google Sheets

Addresses are exported to your configured Google Sheet. You can:

- **Auto-export**: Happens automatically after sync completes
- **Manual export**: Click the "Export" button on any connection

#### Google Sheet Format

| Email | Name | First Seen | Last Seen | Message Count |
|-------|------|------------|-----------|---------------|
| john@example.com | John Doe | 2024-01-15 | 2024-01-20 | 5 |

## Technical Details

### Batch Processing

Large mailboxes are handled efficiently:

- **Batch size**: 200 emails per batch
- **Delay between batches**: 500ms (to avoid Gmail API rate limits)
- **Progress tracking**: Real-time updates stored in database
- **Time estimates**: Calculated from actual processing rate (messages/second)
- **Resumable**: If cancelled, progress is saved and can continue later
- **Automatic scheduling**: Uses Convex scheduler for reliable background processing
- **Race condition protection**: Status checks prevent sync/delete conflicts
- **Stuck detection**: Warns if no progress after 2 minutes

### Batch Deletion

When deleting connections with large datasets:

- Records are deleted in batches of 500 to avoid database limits
- Connection shows "Deleting..." status during the process
- Domains, synced emails, addresses, then the connection itself are deleted
- Delete operation cannot be interrupted by scheduled syncs

### Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Convex Cloud   │────▶│  Gmail API  │
│  (React)    │◀────│  (Functions)    │◀────│  Sheets API │
└─────────────┘     └─────────────────┘     └─────────────┘
```

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Convex (serverless functions + real-time database)
- **Authentication**: Google OAuth 2.0
- **APIs**: Gmail API, Google Sheets API, Google Drive API
- **Deployment**: Docker + nginx

## Troubleshooting

### Gmail folders not loading

1. Check browser console for error messages
2. Ensure Gmail API is enabled in Google Cloud Console
3. Verify OAuth scopes include `gmail.readonly`
4. Try signing out and back in to refresh tokens

### Spreadsheets not loading

1. Ensure Google Drive API is enabled
2. Verify OAuth scopes include `drive.readonly`
3. Check that you have spreadsheets in your Google Drive

### Cannot create spreadsheets

1. Ensure Google Sheets API is enabled
2. Verify OAuth scopes include `spreadsheets`

### Sync times out or fails

1. Large mailboxes are processed in batches automatically
2. If sync fails, click "Sync Now" again - it will resume from where it left off
3. Check Convex dashboard logs for detailed error messages

### Sync appears stuck

1. If sync shows 0% for more than 2 minutes, a warning will appear
2. Click "Reset" to clear the stuck status and try again
3. Reset preserves your synced data - only clears the sync state

### Delete not working / sync and delete running together

1. Ensure you've deployed the latest Convex functions: `npx convex deploy`
2. Delete operations run in batches for large datasets - this is normal
3. The connection will show "Deleting..." status while in progress
4. Scheduled syncs are blocked when a connection is being deleted

### Token errors

If you see token-related errors, sign out and sign back in to get fresh tokens.

### "Function not found" errors

Run `npx convex deploy` to ensure all backend functions are deployed.
