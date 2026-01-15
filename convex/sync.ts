import { action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// Maximum messages to process per sync run to avoid timeout
const MAX_MESSAGES_PER_SYNC = 100;

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

export const checkIfSyncedBatch = internalQuery({
  args: {
    connectionId: v.id("connections"),
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const results: Record<string, boolean> = {};
    for (const messageId of args.messageIds) {
      const existing = await ctx.db
        .query("syncedEmails")
        .withIndex("by_message", (q) =>
          q.eq("connectionId", args.connectionId).eq("messageId", messageId)
        )
        .first();
      results[messageId] = existing !== null;
    }
    return results;
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

export const markSyncedBatch = internalMutation({
  args: {
    connectionId: v.id("connections"),
    messageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const messageId of args.messageIds) {
      await ctx.db.insert("syncedEmails", {
        connectionId: args.connectionId,
        messageId,
        syncedAt: now,
      });
    }
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
  handler: async (ctx, args): Promise<{
    processedCount: number;
    newAddressCount: number;
    moreToProcess: boolean;
    message: string;
  }> => {
    // Get connection details
    const connection: {
      _id: string;
      accessToken: string;
      refreshToken: string;
      tokenExpiry: number;
      mailboxFolder: string;
      lastSyncAt?: number;
    } | null = await ctx.runQuery(api.connections.get, {
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

      // Get filtered domains
      const filteredDomainsArray = await ctx.runQuery(internal.sync.getFilteredDomains, {
        connectionId: args.connectionId,
      });
      const filteredDomains = new Set(filteredDomainsArray);

      let processedCount = 0;
      let newAddressCount = 0;
      let hasMore = false;

      // List messages (single page, limited)
      const listResult: {
        messages: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
      } = await ctx.runAction(
        api.google.gmail.listMessages,
        {
          accessToken,
          labelId: connection.mailboxFolder,
          afterTimestamp: connection.lastSyncAt,
          pageToken: undefined,
        }
      );
      const messages = listResult.messages;
      const nextPageToken: string | undefined = listResult.nextPageToken;

      hasMore = !!nextPageToken;

      // Check which messages are already synced (batch query)
      const messageIds = messages.map((m: { id: string }) => m.id);
      const syncedStatus = await ctx.runQuery(internal.sync.checkIfSyncedBatch, {
        connectionId: args.connectionId,
        messageIds,
      });

      // Filter to only unsynced messages
      const unsyncedMessages = messages.filter((m: { id: string }) => !syncedStatus[m.id]);

      // Limit to MAX_MESSAGES_PER_SYNC
      const toProcess = unsyncedMessages.slice(0, MAX_MESSAGES_PER_SYNC);
      const syncedMessageIds: string[] = [];

      // Process each message
      for (const msg of toProcess) {
        try {
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

          syncedMessageIds.push(msg.id);
          processedCount++;
        } catch (error) {
          console.error(`Failed to process message ${msg.id}:`, error);
          // Continue with next message
        }
      }

      // Mark processed messages as synced (batch)
      if (syncedMessageIds.length > 0) {
        await ctx.runMutation(internal.sync.markSyncedBatch, {
          connectionId: args.connectionId,
          messageIds: syncedMessageIds,
        });
      }

      // Determine final status
      const moreToProcess: boolean = hasMore || unsyncedMessages.length > MAX_MESSAGES_PER_SYNC;

      // Update status
      await ctx.runMutation(api.connections.updateSyncStatus, {
        id: args.connectionId,
        syncStatus: moreToProcess ? "idle" : "idle",
        lastSyncAt: moreToProcess ? connection.lastSyncAt : Date.now(),
        lastError: moreToProcess
          ? `Processed ${processedCount} emails. More remaining - sync again to continue.`
          : undefined,
      });

      return {
        processedCount,
        newAddressCount,
        moreToProcess,
        message: moreToProcess
          ? `Processed ${processedCount} emails. Click sync again to continue.`
          : `Sync complete. Processed ${processedCount} emails, found ${newAddressCount} new addresses.`
      };
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
