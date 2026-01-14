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
