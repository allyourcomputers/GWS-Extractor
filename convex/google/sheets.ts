import { action } from "../_generated/server";
import { v } from "convex/values";

export const getSheetData = action({
  args: {
    accessToken: v.string(),
    spreadsheetId: v.string(),
    range: v.string(),
  },
  handler: async (_ctx, args) => {
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
  handler: async (_ctx, args) => {
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
  handler: async (_ctx, args) => {
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
  handler: async (_ctx, args) => {
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

export const ensureSheetTab = action({
  args: {
    accessToken: v.string(),
    spreadsheetId: v.string(),
    tabName: v.string(),
  },
  handler: async (_ctx, args) => {
    // First check if the tab already exists
    const metaResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${args.accessToken}` },
      }
    );

    if (!metaResponse.ok) {
      const error = await metaResponse.text();
      throw new Error(`Sheets API error: ${error}`);
    }

    const meta = await metaResponse.json();
    const existingTabs = (meta.sheets || []).map(
      (s: { properties: { title: string } }) => s.properties.title
    );

    if (existingTabs.includes(args.tabName)) {
      return; // Tab already exists
    }

    // Create the tab
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${args.spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: { title: args.tabName },
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sheets API error: ${error}`);
    }
  },
});

export const createSpreadsheet = action({
  args: {
    accessToken: v.string(),
    title: v.string(),
    sheetName: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            title: args.title,
          },
          sheets: [
            {
              properties: {
                title: args.sheetName || "Addresses",
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Sheets API error: ${error}`);
    }

    const data = await response.json();
    return {
      id: data.spreadsheetId as string,
      name: data.properties.title as string,
    };
  },
});
