import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    // Delete related data first
    const domains = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const domain of domains) {
      await ctx.db.delete(domain._id);
    }

    const emails = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const email of emails) {
      await ctx.db.delete(email._id);
    }

    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();
    for (const address of addresses) {
      await ctx.db.delete(address._id);
    }

    await ctx.db.delete(args.id);
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

// Full reset - clears all progress and synced emails
export const fullReset = mutation({
  args: { id: v.id("connections") },
  handler: async (ctx, args) => {
    // Delete all synced email records
    const syncedEmails = await ctx.db
      .query("syncedEmails")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.id))
      .collect();

    for (const email of syncedEmails) {
      await ctx.db.delete(email._id);
    }

    // Reset connection status
    await ctx.db.patch(args.id, {
      syncStatus: "idle",
      syncPageToken: undefined,
      messagesProcessed: undefined,
      totalMessagesToSync: undefined,
      lastSyncAt: undefined,
      lastError: undefined,
    });
  },
});
