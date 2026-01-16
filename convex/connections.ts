import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("connections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    mailboxFolder: v.string(),
    sheetsId: v.string(),
    sheetTab: v.string(),
    syncSchedule: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("connections", {
      ...args,
      isActive: true,
      syncStatus: "idle",
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("connections"),
    name: v.optional(v.string()),
    mailboxFolder: v.optional(v.string()),
    sheetsId: v.optional(v.string()),
    sheetTab: v.optional(v.string()),
    syncSchedule: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const remove = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    // Mark connection as deleting
    await ctx.db.patch(args.id, { syncStatus: "deleting" });

    // Schedule batch deletion
    await ctx.scheduler.runAfter(0, internal.connections.deleteConnectionData, {
      connectionId: args.id,
    });
  },
});

// Internal mutation to delete connection data in batches
export const deleteConnectionData = internalMutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 500;

    // Delete domains (usually small)
    const domains = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(BATCH_SIZE);
    for (const domain of domains) {
      await ctx.db.delete(domain._id);
    }
    if (domains.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(100, internal.connections.deleteConnectionData, {
        connectionId: args.connectionId,
      });
      return;
    }

    // Delete synced emails (can be large)
    const emails = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(BATCH_SIZE);
    for (const email of emails) {
      await ctx.db.delete(email._id);
    }
    if (emails.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(100, internal.connections.deleteConnectionData, {
        connectionId: args.connectionId,
      });
      return;
    }

    // Delete addresses
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(BATCH_SIZE);
    for (const address of addresses) {
      await ctx.db.delete(address._id);
    }
    if (addresses.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(100, internal.connections.deleteConnectionData, {
        connectionId: args.connectionId,
      });
      return;
    }

    // All related data deleted, now delete the connection
    const connection = await ctx.db.get(args.connectionId);
    if (connection) {
      await ctx.db.delete(args.connectionId);
    }
  },
});

export const updateSyncStatus = mutation({
  args: {
    id: v.id("connections"),
    syncStatus: v.string(),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    totalMessagesToSync: v.optional(v.number()),
    messagesProcessed: v.optional(v.number()),
    syncPageToken: v.optional(v.string()),
    syncStartedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    // Filter out undefined values
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(id, filtered);
  },
});

export const clearSyncProgress = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      totalMessagesToSync: undefined,
      messagesProcessed: undefined,
      syncPageToken: undefined,
    });
  },
});

export const updateTokens = mutation({
  args: {
    id: v.id("connections"),
    accessToken: v.string(),
    tokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

// Reset a stuck sync (preserves progress)
export const resetSync = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    // Count actual synced emails to preserve accurate progress
    const syncedCount = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();

    await ctx.db.patch(args.id, {
      syncStatus: "idle",
      syncPageToken: undefined,
      messagesProcessed: syncedCount.length,
      lastError: undefined,
    });
  },
});

// Full reset - clears all progress and synced emails (runs in background)
export const fullReset = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    // Mark as resetting
    await ctx.db.patch(args.id, {
      syncStatus: "resetting",
      lastError: "Full reset in progress...",
    });

    // Schedule batch deletion of synced emails
    await ctx.scheduler.runAfter(0, internal.connections.deleteAllSyncedEmails, {
      connectionId: args.id,
    });
  },
});

// Internal mutation to delete synced emails in batches
export const deleteAllSyncedEmails = internalMutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 500;

    const emails = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .take(BATCH_SIZE);

    for (const email of emails) {
      await ctx.db.delete(email._id);
    }

    if (emails.length === BATCH_SIZE) {
      // More to delete, schedule next batch
      await ctx.scheduler.runAfter(100, internal.connections.deleteAllSyncedEmails, {
        connectionId: args.connectionId,
      });
    } else {
      // All done, reset the connection status
      await ctx.db.patch(args.connectionId, {
        syncStatus: "idle",
        syncPageToken: undefined,
        messagesProcessed: undefined,
        totalMessagesToSync: undefined,
        lastSyncAt: undefined,
        lastError: undefined,
      });
    }
  },
});
