import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
  },
});

export const count = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
    return addresses.length;
  },
});

export const upsert = mutation({
  args: {
    connectionId: v.id("connections"),
    email: v.string(),
    name: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_email", (q) =>
        q.eq("connectionId", args.connectionId).eq("email", args.email)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailCount: existing.emailCount + 1,
        // Update name if we have a better one (non-empty and different)
        ...(args.name && args.name !== existing.name ? { name: args.name } : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("addresses", {
      connectionId: args.connectionId,
      email: args.email,
      name: args.name,
      firstContactAt: args.timestamp,
      emailCount: 1,
      lastExportedCount: 0,
    });
  },
});

export const markExported = mutation({
  args: {
    ids: v.array(v.id("addresses")),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const address = await ctx.db.get(id);
      if (address) {
        await ctx.db.patch(id, {
          lastExportedCount: address.emailCount,
        });
      }
    }
  },
});

export const getUnexported = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();

    return addresses.filter((a) => a.emailCount > a.lastExportedCount);
  },
});
