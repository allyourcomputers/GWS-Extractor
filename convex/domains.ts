import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();
  },
});

export const add = mutation({
  args: {
    connectionId: v.id("connections"),
    domain: v.string(),
  },
  handler: async (ctx, args) => {
    // Normalize domain (lowercase, trim)
    const domain = args.domain.toLowerCase().trim();

    // Check if already exists
    const existing = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .filter((q) => q.eq(q.field("domain"), domain))
      .first();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("filteredDomains", {
      connectionId: args.connectionId,
      domain,
    });
  },
});

export const addBulk = mutation({
  args: {
    connectionId: v.id("connections"),
    domains: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("filteredDomains")
      .withIndex("by_connection", (q) => q.eq("connectionId", args.connectionId))
      .collect();

    const existingDomains = new Set(existing.map((d) => d.domain));

    for (const domain of args.domains) {
      const normalized = domain.toLowerCase().trim();
      if (normalized && !existingDomains.has(normalized)) {
        await ctx.db.insert("filteredDomains", {
          connectionId: args.connectionId,
          domain: normalized,
        });
        existingDomains.add(normalized);
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("filteredDomains") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
