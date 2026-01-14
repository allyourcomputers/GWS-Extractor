import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split("T")[0];
}

export const exportToSheets = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args): Promise<{ updatedCount: number; appendedCount: number }> => {
    // Get connection details
    const connection: Doc<"connections"> | null = await ctx.runQuery(api.connections.get, {
      id: args.connectionId,
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    // Check if token needs refresh
    let accessToken: string = connection.accessToken;
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
    const allAddresses: Doc<"addresses">[] = await ctx.runQuery(api.addresses.list, {
      connectionId: args.connectionId,
    });

    if (allAddresses.length === 0) {
      return { updatedCount: 0, appendedCount: 0 };
    }

    // Get existing sheet data
    const range = `${connection.sheetTab}!A:D`;
    const existing: { values: string[][] } = await ctx.runAction(api.google.sheets.getSheetData, {
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
    const addressesToMark: Id<"addresses">[] = [];

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
