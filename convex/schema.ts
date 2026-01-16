import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    googleId: v.string(),
    email: v.string(),
    name: v.string(),
  }).index("by_google_id", ["googleId"]),

  connections: defineTable({
    userId: v.id("users"),
    name: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiry: v.number(),
    mailboxFolder: v.string(),
    sheetsId: v.string(),
    sheetTab: v.string(),
    syncSchedule: v.string(),
    isActive: v.boolean(),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.string(),
    lastError: v.optional(v.string()),
    // Sync progress tracking
    totalMessagesToSync: v.optional(v.number()),
    messagesProcessed: v.optional(v.number()),
    syncPageToken: v.optional(v.string()),
    syncStartedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  filteredDomains: defineTable({
    connectionId: v.id("connections"),
    domain: v.string(),
  }).index("by_connection", ["connectionId"]),

  syncedEmails: defineTable({
    connectionId: v.id("connections"),
    messageId: v.string(),
    syncedAt: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_message", ["connectionId", "messageId"]),

  addresses: defineTable({
    connectionId: v.id("connections"),
    email: v.string(),
    name: v.string(),
    firstContactAt: v.number(),
    emailCount: v.number(),
    lastExportedCount: v.number(),
  })
    .index("by_connection", ["connectionId"])
    .index("by_email", ["connectionId", "email"]),
});
