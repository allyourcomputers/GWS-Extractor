# GWS Email Address Extractor

Extract email addresses from Gmail and export to Google Sheets. Perfect for building contact lists from your inbox.

## Features

- **Gmail Integration**: Connect to any Gmail folder/label to extract sender addresses
- **Google Sheets Export**: Automatically export addresses to Google Sheets (append new, update existing)
- **Create Spreadsheets**: Create new Google Spreadsheets directly from the app
- **Domain Filtering**: Exclude internal domains (e.g., your company's domain) from extraction
- **Multi-Account Support**: Set up multiple connections with different configurations
- **Scheduled Sync**: Configure automatic syncing (every 15 min, hourly, 4 hours, daily, or manual only)
- **Manual Sync**: Trigger sync on-demand from the dashboard

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

## Docker Deployment

### Build and Run

```bash
docker-compose up -d
```

The app will be available at http://localhost:3300

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

### Syncing

- **Automatic**: Connections sync according to their schedule
- **Manual**: Click "Sync Now" on any connection card in the dashboard

### Google Sheet Format

Extracted addresses are exported to your Google Sheet with the following columns:

| Email | Name | First Seen | Last Seen | Message Count |
|-------|------|------------|-----------|---------------|
| john@example.com | John Doe | 2024-01-15 | 2024-01-20 | 5 |

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Backend**: Convex (serverless functions + database)
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

### Token errors

If you see token-related errors, sign out and sign back in to get fresh tokens.
