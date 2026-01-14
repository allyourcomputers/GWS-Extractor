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
    return domains.map((d) => d.domain);
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
      const filteredDomainsArray = await ctx.runQuery(internal.sync.getFilteredDomains, {
        connectionId: args.connectionId,
      });
      const filteredDomains = new Set(filteredDomainsArray);

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
