import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// Maximum messages to process per sync batch
const BATCH_SIZE = 200;
// Delay between batches (in ms) to avoid rate limiting
const BATCH_DELAY_MS = 500;

function parseEmailAddress(fromHeader: string): { email: string; name: string } {
  const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return {
      name: (match[1] || "").trim(),
      email: match[2].toLowerCase().trim(),
    };
  }
  return { name: "", email: fromHeader.toLowerCase().trim() };
}

function getDomainFromEmail(email: string): string {
  const parts = email.split("@");
  return parts[1] || "";
}

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

// Start a new sync - gets email count and begins processing
export const syncConnection = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args): Promise<{ message: string }> => {
    const connection = await ctx.runQuery(api.connections.get, {
      id: args.connectionId,
    });

    if (!connection) {
      throw new Error("Connection not found");
    }

    // If already syncing, don't start another
    if (connection.syncStatus === "syncing") {
      return { message: "Sync already in progress" };
    }

    // Refresh token if needed
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

    // Get label info to know total messages
    const labelInfo = await ctx.runAction(api.google.gmail.getLabelInfo, {
      accessToken,
      labelId: connection.mailboxFolder,
    });

    // Update status to syncing with total count
    await ctx.runMutation(api.connections.updateSyncStatus, {
      id: args.connectionId,
      syncStatus: "syncing",
      totalMessagesToSync: labelInfo.messagesTotal,
      messagesProcessed: connection.messagesProcessed || 0,
      lastError: `Starting sync of ${labelInfo.messagesTotal} messages...`,
    });

    // Schedule the first batch
    await ctx.scheduler.runAfter(100, internal.sync.processBatch, {
      connectionId: args.connectionId,
    });

    return {
      message: `Started syncing ${labelInfo.messagesTotal} messages. Processing in background...`,
    };
  },
});

// Process a single batch of messages (internal - called by scheduler)
export const processBatch = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args): Promise<void> => {
    const connection = await ctx.runQuery(api.connections.get, {
      id: args.connectionId,
    });

    if (!connection) {
      console.error("Connection not found");
      return;
    }

    // Check if sync was cancelled
    if (connection.syncStatus !== "syncing") {
      console.log("Sync was cancelled or completed");
      return;
    }

    try {
      // Refresh token if needed
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

      // List messages (use pageToken if we have one from previous batch)
      const listResult: {
        messages: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
      } = await ctx.runAction(api.google.gmail.listMessages, {
        accessToken,
        labelId: connection.mailboxFolder,
        afterTimestamp: connection.lastSyncAt,
        pageToken: connection.syncPageToken,
      });

      const messages = listResult.messages;
      const nextPageToken = listResult.nextPageToken;

      if (messages.length === 0) {
        // No more messages - sync complete
        await ctx.runMutation(api.connections.updateSyncStatus, {
          id: args.connectionId,
          syncStatus: "idle",
          lastSyncAt: Date.now(),
          lastError: undefined,
          syncPageToken: undefined,
        });
        return;
      }

      // Check which messages are already synced
      const messageIds = messages.map((m: { id: string }) => m.id);
      const syncedStatus = await ctx.runQuery(internal.sync.checkIfSyncedBatch, {
        connectionId: args.connectionId,
        messageIds,
      });

      // Filter to only unsynced messages and limit to batch size
      const unsyncedMessages = messages.filter((m: { id: string }) => !syncedStatus[m.id]);
      const toProcess = unsyncedMessages.slice(0, BATCH_SIZE);

      let newAddressCount = 0;
      const syncedMessageIds: string[] = [];

      // Process each message
      for (const msg of toProcess) {
        try {
          const details = await ctx.runAction(api.google.gmail.getMessage, {
            accessToken,
            messageId: msg.id,
          });

          const { email, name } = parseEmailAddress(details.from);
          const domain = getDomainFromEmail(email);

          if (!filteredDomains.has(domain)) {
            await ctx.runMutation(api.addresses.upsert, {
              connectionId: args.connectionId,
              email,
              name,
              timestamp: details.timestamp,
            });
            newAddressCount++;
          }

          syncedMessageIds.push(msg.id);
        } catch (error) {
          console.error(`Failed to process message ${msg.id}:`, error);
        }
      }

      // Mark processed messages as synced
      if (syncedMessageIds.length > 0) {
        await ctx.runMutation(internal.sync.markSyncedBatch, {
          connectionId: args.connectionId,
          messageIds: syncedMessageIds,
        });
      }

      // Calculate progress
      const processed = (connection.messagesProcessed || 0) + syncedMessageIds.length;
      const total = connection.totalMessagesToSync || 0;
      const percentComplete = total > 0 ? Math.round((processed / total) * 100) : 0;

      // Determine if there's more to process
      const moreInPage = unsyncedMessages.length > BATCH_SIZE;
      const morePages = !!nextPageToken;
      const hasMore = moreInPage || morePages;

      if (hasMore) {
        // Update progress and schedule next batch
        await ctx.runMutation(api.connections.updateSyncStatus, {
          id: args.connectionId,
          syncStatus: "syncing",
          messagesProcessed: processed,
          syncPageToken: moreInPage ? connection.syncPageToken : nextPageToken,
          lastError: `Syncing... ${processed}/${total} (${percentComplete}%) - Found ${newAddressCount} new addresses this batch`,
        });

        // Schedule next batch with delay
        await ctx.scheduler.runAfter(BATCH_DELAY_MS, internal.sync.processBatch, {
          connectionId: args.connectionId,
        });
      } else {
        // Sync complete
        await ctx.runMutation(api.connections.updateSyncStatus, {
          id: args.connectionId,
          syncStatus: "idle",
          lastSyncAt: Date.now(),
          messagesProcessed: processed,
          lastError: undefined,
          syncPageToken: undefined,
        });
      }
    } catch (error) {
      console.error("Batch processing error:", error);
      await ctx.runMutation(api.connections.updateSyncStatus, {
        id: args.connectionId,
        syncStatus: "error",
        lastError: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

// Cancel an ongoing sync
export const cancelSync = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args): Promise<{ message: string }> => {
    await ctx.runMutation(api.connections.updateSyncStatus, {
      id: args.connectionId,
      syncStatus: "idle",
      lastError: "Sync cancelled by user",
    });
    return { message: "Sync cancelled" };
  },
});
